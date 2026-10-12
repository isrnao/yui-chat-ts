import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';

/**
 * 境界線のドラッグ（RetroSplitter とツーショットの FrameLayout で共有する）。
 *
 * - Pointer Events と setPointerCapture で、マウスでもタッチでも同じに動く。左ボタン・主ポインタだけ
 * - 押し始めで onStart を呼び、以後は押し始めからの移動量（px）を onDrag へ渡す。
 *   描画 1 回に 1 度だけ渡し、最後の位置は pointerup で必ず渡す
 * - ドラッグ中は body の文字選択を止め、カーソルを row-resize にする
 * - resetKey が変わったら（入退室で上側の画面が入れ替わったなど）ドラッグをやめ、予約した更新を捨てる
 */
export function useSplitterDrag({
  onStart,
  onDrag,
  resetKey,
}: {
  onStart: () => void;
  onDrag: (deltaY: number) => void;
  resetKey?: unknown;
}) {
  const [dragging, setDragging] = useState(false);
  const active = useRef<{ pointerId: number; startY: number } | null>(null);
  const lastDelta = useRef<number | null>(null);
  const frame = useRef<number | null>(null);

  const cancelFrame = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      active.current = null;
      lastDelta.current = null;
      setDragging(false);
    },
    [resetKey]
  );
  useEffect(() => {
    if (!dragging) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [dragging]);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || event.isPrimary === false || active.current !== null) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = { pointerId: event.pointerId, startY: event.clientY };
    lastDelta.current = null;
    onStart();
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const current = active.current;
    if (current === null || current.pointerId !== event.pointerId) return;
    const delta = event.clientY - current.startY;
    lastDelta.current = delta;
    cancelFrame();
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      onDrag(delta);
    });
  };
  const end = (event: PointerEvent<HTMLElement>) => {
    if (active.current?.pointerId !== event.pointerId) return;
    cancelFrame();
    if (event.type === 'pointerup' && lastDelta.current !== null) onDrag(lastDelta.current);
    active.current = null;
    lastDelta.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return {
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
      onLostPointerCapture: end,
    },
  };
}
