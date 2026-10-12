import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEntrySubmission } from './useEntrySubmission';

describe('入室送信', () => {
  it('pending時のプログラム送信も拒否する', async () => {
    const action = vi.fn();
    const { result } = renderHook(() => useEntrySubmission(true));
    await act(() => result.current.submit(action));
    expect(action).not.toHaveBeenCalled();
  });

  it('同じtickの二重送信を拒否し、失敗後は再送できる', async () => {
    let reject!: (reason: Error) => void;
    const action = vi.fn(() => new Promise<void>((_, no) => (reject = no)));
    const { result } = renderHook(() => useEntrySubmission(false));
    const first = result.current.submit(action);
    await result.current.submit(action);
    expect(action).toHaveBeenCalledTimes(1);
    reject(new Error('入室失敗'));
    await first;
    await result.current.submit(() => {
      throw new Error('同期失敗');
    });
    const retry = vi.fn();
    await result.current.submit(retry);
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
