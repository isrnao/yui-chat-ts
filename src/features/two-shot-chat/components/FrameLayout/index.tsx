import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
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
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // 上ペインの割合（0〜1）。動かす前は null で、初期の割合で描く
  const [moved, setMoved] = useState<number | null>(null);
  const ratio = moved ?? initialTopPercent / 100;

  // 高さはイベントの中でだけ読む（レンダー中に ref を読まない）
  const available = () => (rootRef.current?.clientHeight ?? 0) - BORDER;
  const currentTop = () => Math.floor(Math.max(available(), 0) * ratio);
  // 今の高さで両方のペインが MIN_PANE 以上になるように丸めてから、割合にして持つ
  const resize = (value: number) => {
    const total = available();
    if (total <= 0) return;
    const topPx = Math.min(Math.max(value, MIN_PANE), Math.max(total - MIN_PANE, MIN_PANE));
    setMoved(topPx / total);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, startY: event.clientY, startTop: currentTop() };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    resize(current.startTop + event.clientY - current.startY);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
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
    }
  };

  if (fixedTopPx !== undefined) {
    return (
      <TwoShotScope
        className="ts-frames ts-frames-fixed"
        style={{ '--ts-top-px': `${fixedTopPx}px` } as CSSProperties}
      >
        <section className="ts-pane" aria-label={topLabel}>
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
      <section className="ts-pane" aria-label={topLabel}>
        {top}
      </section>
      <div
        className="ts-frame-border"
        role="separator"
        aria-orientation="horizontal"
        aria-label="フレームの境界"
        aria-valuemin={0}
        aria-valuemax={100}
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
