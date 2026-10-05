import { useRef } from 'react';
import type { MouseEvent, PointerEvent } from 'react';

/** 1 回目と 2 回目のタップの間に許す時間（ms） */
export const DOUBLE_TAP_MS = 300;
/** 1 回目と 2 回目のタップの位置の差として許す距離（px） */
export const DOUBLE_TAP_DISTANCE_PX = 24;
/** 1 回のタップの中で許す移動量（px）。超えたらスクロールやドラッグとみなす */
export const TAP_MOVE_TOLERANCE_PX = 10;

/** ダブルタップの対象にしない要素。リンクやボタンは、それぞれの操作を優先する */
const INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, label, summary';

function isInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;
}

type Point = { x: number; y: number };

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * 発言の行のダブルタップ（ダブルクリック）（.kiro/specs/chat-ip-mute Requirement 1）。
 * Pointer Events で数えるので、マウスでもタッチでも同じに動く（モバイルの dblclick は、ブラウザや拡大の設定で
 * 出たり出なかったりするため使わない）。文字の上でも反応する。リンク・ボタンなどの上では反応しない。
 *
 * - 2 回のタップが DOUBLE_TAP_MS 以内で、位置の差が DOUBLE_TAP_DISTANCE_PX 以内のとき成立
 * - 1 回のタップの中で TAP_MOVE_TOLERANCE_PX を超えて動いたら（スクロールなど）数え直す
 * - 2 本目以降の指（isPrimary でないポインタ）は数えない
 * - マウスのダブルクリックで単語が選択されないよう、2 回目の mousedown の既定の動作を止める
 * - 状態は ref だけに持つので、タップで再レンダーしない
 */
export function useDoubleTap({
  enabled,
  onDoubleTap,
}: {
  enabled: boolean;
  /** 成立したときに、行の要素を渡して呼ぶ */
  onDoubleTap: (element: HTMLElement) => void;
}) {
  const downRef = useRef<(Point & { pointerId: number }) | null>(null);
  const lastTapRef = useRef<(Point & { time: number }) | null>(null);

  const reset = () => {
    downRef.current = null;
    lastTapRef.current = null;
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!enabled || event.isPrimary === false || event.button !== 0) return;
    if (isInteractive(event.target)) {
      reset();
      return;
    }
    downRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const down = downRef.current;
    downRef.current = null;
    if (!down || down.pointerId !== event.pointerId) return;

    const point = { x: event.clientX, y: event.clientY };
    if (distance(down, point) > TAP_MOVE_TOLERANCE_PX) {
      lastTapRef.current = null;
      return;
    }

    const now = Date.now();
    const last = lastTapRef.current;
    if (
      last &&
      now - last.time <= DOUBLE_TAP_MS &&
      distance(last, point) <= DOUBLE_TAP_DISTANCE_PX
    ) {
      lastTapRef.current = null;
      onDoubleTap(event.currentTarget);
      return;
    }
    lastTapRef.current = { ...point, time: now };
  };

  const onMouseDown = (event: MouseEvent<HTMLElement>) => {
    if (enabled && event.detail >= 2 && !isInteractive(event.target)) event.preventDefault();
  };

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel: reset,
    onMouseDown,
  };
}
