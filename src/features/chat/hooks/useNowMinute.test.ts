import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNowMinute } from './useNowMinute';

describe('useNowMinute', () => {
  const fixedTime = Date.parse('2024-01-01T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedTime);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns Date.now() as the initial value', () => {
    const { result } = renderHook(() => useNowMinute());

    expect(result.current).toBe(fixedTime);
  });

  it('updates at the next minute boundary and then every 60 seconds', () => {
    const { result } = renderHook(() => useNowMinute());

    act(() => {
      vi.advanceTimersByTime(59_999);
    });
    expect(result.current).toBe(fixedTime);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(fixedTime + 60_000);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(fixedTime + 120_000);
  });
});
