import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useVisibleInterval } from './useVisibleInterval';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('useVisibleInterval', () => {
  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('enabled の間だけ seconds 間隔で onTick を呼ぶ', () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    const { rerender } = renderHook(({ enabled }) => useVisibleInterval(1, onTick, enabled), {
      initialProps: { enabled: true },
    });
    act(() => vi.advanceTimersByTime(2_000));
    expect(onTick).toHaveBeenCalledTimes(2);
    rerender({ enabled: false });
    act(() => vi.advanceTimersByTime(5_000));
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  // 張り直されると経過時間がリセットされ、発火が先延ばしになってしまう
  it('onTick の同一性が変わっても timer を張り直さず最新の callback を呼ぶ', () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useVisibleInterval(1, cb, true), {
      initialProps: { cb: first },
    });
    act(() => vi.advanceTimersByTime(500));
    rerender({ cb: second });
    act(() => vi.advanceTimersByTime(500));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('表示中だけ間隔で呼び、非表示では止め、表示に戻ったらすぐ 1 回呼ぶ', () => {
    vi.useFakeTimers();
    setVisibility('visible');
    const onTick = vi.fn();
    const { unmount } = renderHook(() => useVisibleInterval(20, onTick, true));
    act(() => vi.advanceTimersByTime(40_000));
    expect(onTick).toHaveBeenCalledTimes(2);
    act(() => setVisibility('hidden'));
    act(() => vi.advanceTimersByTime(60_000));
    expect(onTick).toHaveBeenCalledTimes(2);
    act(() => setVisibility('visible'));
    expect(onTick).toHaveBeenCalledTimes(3);
    unmount();
  });

  it('0 秒（なし）では何もしない', () => {
    vi.useFakeTimers();
    const onTick = vi.fn();
    renderHook(() => useVisibleInterval(0, onTick, true));
    act(() => vi.advanceTimersByTime(60_000));
    expect(onTick).not.toHaveBeenCalled();
  });
});
