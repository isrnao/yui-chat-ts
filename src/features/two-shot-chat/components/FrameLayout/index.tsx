import {
  useRef,
  useId,
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { splitterBounds } from '@shared/utils/splitterBounds';
import TwoShotScope from '../Scope';

/** ペインの最小の高さ（px） */
const MIN_PANE = 40;
/** 境界線の太さ（原作の frameset の border=5） */
const BORDER = 5;

type Drag = { pointerId: number; startY: number; startTop: number };

/**
 * 原作の <frameset rows="30%,70%" border=5 bordercolor=#555555> を 1 つの React のツリーで再現する。
 * 上下のペインはそれぞれ独立してスクロールし、境界線はドラッグと上下の矢印キーで動かせる（原作のフレームと同じ）。
 * spec: .kiro/specs/two-shot-chat/design.md §4
 *
 * 境界の位置は上ペインの割合で持ち、CSS 変数（--ts-top）で渡す。初期値も同じ変数なので、SSG と hydration で
 * 同じ HTML になる。動かした後も px ではなく割合で持つので、ウィンドウの高さが変わっても両方のペインが
 * 同じ比率で伸び縮みし、下のペインが潰れない。
 * 画面（入口 / 入室後）ごとに別のコンポーネントの中に置くので、画面が変わると比率も既定に戻る。
 */
export default function FrameLayout({
  initialTopPercent = 30,
  fixedTopPx,
  top,
  bottom,
  topLabel,
  bottomLabel,
}: {
  initialTopPercent?: number;
  /**
   * 上のペインの高さを px で固定し、境界線を出さない（待合室の <frameset rows="245,*" border=0>）。
   * このときは境界線を動かせない
   */
  fixedTopPx?: number;
  top: ReactNode;
  bottom: ReactNode;
  topLabel: string;
  bottomLabel: string;
}) {
  const paneId = useId();
  const frame = useRef<number | null>(null);
  const lastTop = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [geometry, setGeometry] = useState({ height: 0, bar: BORDER });
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // 上ペインの割合（0〜1）。動かす前は null で、初期の割合で描く
  const [moved, setMoved] = useState<number | null>(null);
  const limits = splitterBounds(geometry.height, geometry.bar, MIN_PANE, MIN_PANE);
  const minimum = limits.available ? limits.min / limits.available : 0;
  const maximum = limits.available ? limits.max / limits.available : 1;
  const ratio = Math.max(minimum, Math.min(maximum, moved ?? initialTopPercent / 100));
  const cancelFrame = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () =>
      setGeometry({
        height: root.clientHeight,
        bar: Number.parseFloat(getComputedStyle(root).getPropertyValue('--ts-border')) || BORDER,
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => {
      observer.disconnect();
      cancelFrame();
      drag.current = null;
    };
  }, []);
  useEffect(() => {
    if (!dragging) return;
    const previous = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.userSelect = previous;
    };
  }, [dragging]);

  // 高さはイベントの中でだけ読む（レンダー中に ref を読まない）
  const available = () => (rootRef.current?.clientHeight ?? 0) - geometry.bar;
  const currentTop = () => Math.floor(Math.max(available(), 0) * ratio);
  // 今の高さで両方のペインが MIN_PANE 以上になるように丸めてから、割合にして持つ
  const resize = (value: number) => {
    const total = available();
    if (total <= 0) return;
    const { min, max } = splitterBounds(total + geometry.bar, geometry.bar, MIN_PANE, MIN_PANE);
    const topPx = Math.min(Math.max(value, min), max);
    setGeometry({ height: total + geometry.bar, bar: geometry.bar });
    setMoved(topPx / total);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.isPrimary === false || drag.current !== null) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    lastTop.current = null;
    setDragging(true);
    drag.current = { pointerId: event.pointerId, startY: event.clientY, startTop: currentTop() };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    const top = current.startTop + event.clientY - current.startY;
    lastTop.current = top;
    cancelFrame();
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      resize(top);
    });
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    cancelFrame();
    if (event.type === 'pointerup' && lastTop.current !== null) resize(lastTop.current);
    lastTop.current = null;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = Math.max(Math.round(available() / 100), 1);
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      resize(currentTop() - step);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      resize(currentTop() + step);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const total = available();
      const range = splitterBounds(total + geometry.bar, geometry.bar, MIN_PANE, MIN_PANE);
      resize(event.key === 'Home' ? range.min : range.max);
    }
  };

  if (fixedTopPx !== undefined) {
    return (
      <TwoShotScope
        className="ts-frames ts-frames-fixed"
        style={{ '--ts-top-px': `${fixedTopPx}px` } as CSSProperties}
      >
        <section id={paneId} className="ts-pane" aria-label={topLabel}>
          {top}
        </section>
        <section className="ts-pane" aria-label={bottomLabel}>
          {bottom}
        </section>
      </TwoShotScope>
    );
  }

  return (
    <TwoShotScope
      ref={rootRef}
      className="ts-frames"
      style={{ '--ts-top': ratio } as CSSProperties}
    >
      <section id={paneId} className="ts-pane" aria-label={topLabel}>
        {top}
      </section>
      <div
        className="ts-frame-border"
        role="separator"
        aria-orientation="horizontal"
        aria-label="フレームの境界"
        aria-controls={paneId}
        aria-valuemin={Math.round(minimum * 100)}
        aria-valuemax={Math.round(maximum * 100)}
        aria-valuenow={Math.round(ratio * 100)}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
      />
      <section className="ts-pane" aria-label={bottomLabel}>
        {bottom}
      </section>
    </TwoShotScope>
  );
}
