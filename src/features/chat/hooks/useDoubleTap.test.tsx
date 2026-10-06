import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useDoubleTap, DOUBLE_TAP_MS, DOUBLE_TAP_DISTANCE_PX } from './useDoubleTap';

/** jsdom には PointerEvent がないので、テストの中でだけ用意する（RetroSplitter.test.tsx と同じ） */
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  isPrimary: boolean;
  constructor(
    type: string,
    init: ConstructorParameters<typeof MouseEvent>[1] & {
      pointerId?: number;
      isPrimary?: boolean;
    } = {}
  ) {
    super(type, { bubbles: true, cancelable: true, ...init });
    this.pointerId = init.pointerId ?? 1;
    this.isPrimary = init.isPrimary ?? true;
  }
}

function Row({ onDoubleTap, enabled = true }: { onDoubleTap: () => void; enabled?: boolean }) {
  const handlers = useDoubleTap({ enabled, onDoubleTap });
  return (
    <div data-testid="row" {...handlers}>
      <span>本文</span>
      <a href="https://example.com/">リンク</a>
    </div>
  );
}

type TapInit = { x?: number; y?: number; moveTo?: { x: number; y: number }; pointerId?: number };

function tap(target: Element, { x = 50, y = 5, moveTo, pointerId = 1 }: TapInit = {}) {
  fireEvent.pointerDown(target, { button: 0, pointerId, clientX: x, clientY: y });
  const up = moveTo ?? { x, y };
  fireEvent.pointerUp(target, { button: 0, pointerId, clientX: up.x, clientY: up.y });
}

describe('useDoubleTap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('PointerEvent', TestPointerEvent);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it(`${DOUBLE_TAP_MS}ms 以内に 2 回タップすると成立し、行の要素を渡す。文字の上でもよい`, () => {
    const onDoubleTap = vi.fn();
    render(<Row onDoubleTap={onDoubleTap} />);
    const text = screen.getByText('本文');

    tap(text);
    expect(onDoubleTap).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DOUBLE_TAP_MS);
    tap(text);
    expect(onDoubleTap).toHaveBeenCalledExactlyOnceWith(screen.getByTestId('row'));
  });

  it('間が空きすぎたら成立しない。3 回目は新しい 1 回目として数える', () => {
    const onDoubleTap = vi.fn();
    render(<Row onDoubleTap={onDoubleTap} />);
    const row = screen.getByTestId('row');

    tap(row);
    vi.advanceTimersByTime(DOUBLE_TAP_MS + 1);
    tap(row);
    expect(onDoubleTap).not.toHaveBeenCalled();
    tap(row);
    expect(onDoubleTap).toHaveBeenCalledTimes(1);
  });

  it('2 回のタップの位置が離れていたら成立しない', () => {
    const onDoubleTap = vi.fn();
    render(<Row onDoubleTap={onDoubleTap} />);
    const row = screen.getByTestId('row');
    tap(row, { x: 50 });
    tap(row, { x: 50 + DOUBLE_TAP_DISTANCE_PX + 1 });
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('タップの途中で動かしたら（スクロールなど）数え直す', () => {
    const onDoubleTap = vi.fn();
    render(<Row onDoubleTap={onDoubleTap} />);
    const row = screen.getByTestId('row');
    tap(row);
    tap(row, { moveTo: { x: 50, y: 30 } });
    tap(row);
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('pointercancel で数え直す', () => {
    const onDoubleTap = vi.fn();
    render(<Row onDoubleTap={onDoubleTap} />);
    const row = screen.getByTestId('row');
    tap(row);
    fireEvent.pointerCancel(row, { pointerId: 1 });
    tap(row);
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('リンクの上では反応しない', () => {
    const onDoubleTap = vi.fn();
    render(<Row onDoubleTap={onDoubleTap} />);
    const link = screen.getByText('リンク');
    tap(link);
    tap(link);
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('2 本目の指・主ボタン以外・enabled でないときは数えない', () => {
    const onDoubleTap = vi.fn();
    const { rerender } = render(<Row onDoubleTap={onDoubleTap} />);
    const row = () => screen.getByTestId('row');

    tap(row());
    fireEvent.pointerDown(row(), { button: 0, pointerId: 2, isPrimary: false });
    fireEvent.pointerUp(row(), { button: 0, pointerId: 2, isPrimary: false });
    fireEvent.pointerDown(row(), { button: 2, pointerId: 1 });
    fireEvent.pointerUp(row(), { button: 2, pointerId: 1 });
    expect(onDoubleTap).not.toHaveBeenCalled();

    rerender(<Row onDoubleTap={onDoubleTap} enabled={false} />);
    vi.advanceTimersByTime(DOUBLE_TAP_MS + 1);
    tap(row());
    tap(row());
    expect(onDoubleTap).not.toHaveBeenCalled();
  });

  it('マウスのダブルクリックで単語を選択しない（2 回目の mousedown を止める）。リンクの上は止めない', () => {
    render(<Row onDoubleTap={vi.fn()} />);
    expect(fireEvent.mouseDown(screen.getByText('本文'), { detail: 1 })).toBe(true);
    expect(fireEvent.mouseDown(screen.getByText('本文'), { detail: 2 })).toBe(false);
    expect(fireEvent.mouseDown(screen.getByText('リンク'), { detail: 2 })).toBe(true);
  });
});
