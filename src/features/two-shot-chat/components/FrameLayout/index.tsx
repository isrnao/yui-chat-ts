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
 * 初期の比率は CSS 変数で渡すだけなので、SSG と hydration で同じ HTML になる。動かした後は px で持つ。
 * 画面（入口 / 入室後）ごとに別のコンポーネントの中に置くので、画面が変わると比率も既定に戻る。
 */
export default function FrameLayout({
  initialTopPercent,
  top,
  bottom,
  topLabel,
  bottomLabel,
}: {
  initialTopPercent: number;
  top: ReactNode;
  bottom: ReactNode;
  topLabel: string;
  bottomLabel: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // 動かす前は null（CSS の割合で描く）。動かした後の高さと、そのときの割合（aria-valuenow 用）
  const [size, setSize] = useState<{ topPx: number; percent: number } | null>(null);

  // 高さはイベントの中でだけ読む（レンダー中に ref を読まない）
  const available = () => (rootRef.current?.clientHeight ?? 0) - BORDER;
  const currentTop = () =>
    size?.topPx ?? Math.floor(Math.max(available(), 0) * (initialTopPercent / 100));
  const resize = (value: number) => {
    const total = available();
    const topPx = Math.min(Math.max(value, MIN_PANE), Math.max(total - MIN_PANE, MIN_PANE));
    setSize({ topPx, percent: total > 0 ? Math.round((topPx / total) * 100) : initialTopPercent });
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

  return (
    <TwoShotScope
      ref={rootRef}
      className="ts-frames"
      style={
        size === null
          ? ({ '--ts-top': initialTopPercent / 100 } as CSSProperties)
          : { gridTemplateRows: `${size.topPx}px ${BORDER}px minmax(0, 1fr)` }
      }
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
        aria-valuenow={size?.percent ?? initialTopPercent}
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
