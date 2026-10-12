import { afterEach, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRoomCounts } from './useRoomCounts';
import { fetchRoomCountsResult } from '../api/roomCountsApi';

vi.mock('../api/roomCountsApi', () => ({
  fetchRoomCountsResult: vi.fn(() =>
    Promise.resolve({ kind: 'ready', counts: {}, failedRooms: [], asOf: 1 })
  ),
}));

let visibility: 'visible' | 'hidden' = 'visible';
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  visibility = 'visible';
});

it('表示していた時間ではなく、隠れていた時間で人数を取り直すかを決める', async () => {
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  vi.useFakeTimers();
  renderHook(() => useRoomCounts());
  await act(async () => {});
  expect(fetchRoomCountsResult).toHaveBeenCalledTimes(1);
  const returnAfter = (hiddenMs: number) =>
    act(async () => {
      visibility = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(hiddenMs);
      visibility = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(50);
    });

  // 10 分表示したあと、2 秒だけ別のタブへ行って戻る
  act(() => vi.advanceTimersByTime(600_000));
  await returnAfter(2_000);
  expect(fetchRoomCountsResult).toHaveBeenCalledTimes(1);

  await returnAfter(60_000);
  expect(fetchRoomCountsResult).toHaveBeenCalledTimes(2);
});
