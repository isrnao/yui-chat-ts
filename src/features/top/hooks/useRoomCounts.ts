import { useEffect, useState } from 'react';
import { fetchRoomParticipantCounts, type RoomCountMap } from '../api/roomCountsApi';

/** 取得状態 */
export type UseRoomCountsState = {
  counts: RoomCountMap;
  isLoading: boolean;
  error: Error | null;
};

/** 参加人数を数える期間の既定値（6 時間）。既定引数に式を書くと React Compiler がコンパイルできない */
const DEFAULT_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * トップページ用: Supabase から直近 `windowMs` 内のメッセージを取得し、
 * ルームごとのユニーク参加者数を返す。失敗時は空オブジェクトで解決する。
 *
 * デフォルトは 6 時間。
 */
export function useRoomCounts(windowMs: number = DEFAULT_WINDOW_MS): UseRoomCountsState {
  const [state, setState] = useState<UseRoomCountsState>({
    counts: {},
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    fetchRoomParticipantCounts(windowMs)
      .then((counts) => {
        if (cancelled) return;
        setState({ counts, isLoading: false, error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          counts: {},
          isLoading: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [windowMs]);

  return state;
}
