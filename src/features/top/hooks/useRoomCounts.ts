import { useEffect, useState } from 'react';
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
    let refreshed = Date.now();
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
    const restore = (event: Event) => {
      if (document.visibilityState === 'hidden') return;
      const persisted =
        typeof PageTransitionEvent !== 'undefined' &&
        event instanceof PageTransitionEvent &&
        event.persisted;
      const age = Date.now() - refreshed;
      if (age >= 60_000 || (persisted && age >= 1_000)) {
        refreshed = Date.now();
        setAttempt((value) => value + 1);
      }
    };
    document.addEventListener('visibilitychange', restore);
    window.addEventListener('pageshow', restore);
    return () => {
      cancelled = true;
      controller.abort();
      document.removeEventListener('visibilitychange', restore);
      window.removeEventListener('pageshow', restore);
    };
  }, [windowMs, attempt]);
  return {
    ...state,
    retry: () => {
      if (state.isLoading) return;
      setState((previous) => ({ ...previous, isLoading: true }));
      setAttempt((value) => value + 1);
    },
  };
}
