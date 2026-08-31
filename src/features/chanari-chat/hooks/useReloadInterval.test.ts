import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useReloadInterval } from './useReloadInterval';

describe('useReloadInterval', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('enabled の間だけ seconds 間隔で onTick を呼ぶ', () => {
    vi.useFakeTimers();
    const onTick = vi.fn();

    const { rerender } = renderHook(({ enabled }) => useReloadInterval(1, onTick, enabled), {
      initialProps: { enabled: true },
    });

    act(() => vi.advanceTimersByTime(2_000));
    expect(onTick).toHaveBeenCalledTimes(2);

    rerender({ enabled: false });
    act(() => vi.advanceTimersByTime(5_000));
    expect(onTick).toHaveBeenCalledTimes(2);
  });

  // useEffectEvent により、callback の同一性が変わっても timer は張り直されない。
  // 張り直されると経過時間がリセットされ、発火が先延ばしになってしまう。
  it('onTick の同一性が変わっても timer を張り直さず最新の callback を呼ぶ', () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = renderHook(({ cb }) => useReloadInterval(1, cb, true), {
      initialProps: { cb: first },
    });

    act(() => vi.advanceTimersByTime(500));
    rerender({ cb: second });
    act(() => vi.advanceTimersByTime(500));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
