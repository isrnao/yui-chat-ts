import { useEffect, useState } from 'react';
import { usePageReturn } from '@shared/hooks/usePageReturn';
import { getListableRoomIds } from '@features/chat/rooms';
import {
  fetchRoomCountsResult,
  type RoomCountMap,
  type RoomCountResult,
} from '../api/roomCountsApi';
export type UseRoomCountsState = Omit<RoomCountResult, 'kind'> & {
  kind: RoomCountResult['kind'] | 'loading';
  isLoading: boolean;
  retry: () => void;
};
const DEFAULT_WINDOW_MS = 6 * 60 * 60 * 1000;
const STALE_AFTER_HIDDEN_MS = 60_000;
export function useRoomCounts(windowMs: number = DEFAULT_WINDOW_MS): UseRoomCountsState {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<UseRoomCountsState, 'retry'>>({
    kind: 'loading',
    counts: {},
    failedRooms: [...getListableRoomIds()],
    isLoading: true,
  });
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetchRoomCountsResult(windowMs, controller.signal).then(
      (result) => {
        if (cancelled) return;
        setState((previous) => {
          const counts: RoomCountMap = { ...previous.counts, ...result.counts };
          for (const room of getListableRoomIds()) {
            if (!result.failedRooms.includes(room)) counts[room] = result.counts[room] ?? 0;
          }
          return { ...result, counts, asOf: result.asOf ?? previous.asOf, isLoading: false };
        });
      },
      () => {
        if (!cancelled)
          setState((previous) => ({
            ...previous,
            kind: 'failed',
            failedRooms: [...getListableRoomIds()],
            isLoading: false,
          }));
      }
    );
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [windowMs, attempt]);
  // 表示していた時間ではなく隠れていた時間で古さを判断する（短いタブ切替のたびに取り直さない）
  usePageReturn(({ hiddenMs, persisted }) => {
    if (persisted || hiddenMs >= STALE_AFTER_HIDDEN_MS) setAttempt((value) => value + 1);
  });
  return {
    ...state,
    retry: () => {
      if (state.isLoading) return;
      setState((previous) => ({ ...previous, isLoading: true }));
      setAttempt((value) => value + 1);
    },
  };
}
