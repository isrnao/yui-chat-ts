import { createEvent, fireEvent } from '@testing-library/react';

/**
 * <dialog> の背景（::backdrop）を押す。ブラウザでは、窓の矩形の外を指した <dialog> 自身への
 * pointerdown と click として届く。jsdom には PointerEvent がないので座標を後から付ける
 */
export function pressBackdrop(dialog: HTMLElement): void {
  const down = createEvent.pointerDown(dialog);
  Object.defineProperties(down, { clientX: { value: -1 }, clientY: { value: -1 } });
  fireEvent(dialog, down);
  fireEvent.click(dialog, { clientX: -1, clientY: -1 });
}
