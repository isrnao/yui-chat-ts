import { describe, it, expect, vi, afterEach } from 'vitest';
import { retryWithBackoff, warnIfSlow } from './retry';

describe('retryWithBackoff', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('成功するまで試行番号を増やして再試行する', async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockResolvedValue('ok');

    const result = retryWithBackoff(fn);
    await vi.advanceTimersByTimeAsync(1000 + 2000);

    await expect(result).resolves.toBe('ok');
    expect(fn.mock.calls.map(([attempt]) => attempt)).toEqual([1, 2, 3]);
  });

  it('上限の回数で失敗したら最後のエラーを投げる', async () => {
    const fn = vi.fn(() => Promise.reject(new Error('boom')));
    await expect(retryWithBackoff(fn, { attempts: 2, baseDelayMs: 0 })).rejects.toThrow('boom');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('warnIfSlow', () => {
  it('閾値を超えたときだけ警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const now = performance.now();
    warnIfSlow('fast', now);
    warnIfSlow('slow', now - 5000);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('slow');
    warn.mockRestore();
  });
});
