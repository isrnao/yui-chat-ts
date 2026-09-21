import { useEffect, useState } from 'react';
import { loadChatRanking } from '@features/chat/api/chatApi';
import type { RankingEntry } from '@features/chat/utils/chatRanking';
import { useResetOnChange } from '@shared/hooks/useResetOnChange';
import type { RoomId } from '@features/chat/rooms';

export type RoomRankingState = {
  ranking: RankingEntry[];
  isLoading: boolean;
  hasError: boolean;
};

/**
 * 部屋の発言ランキング (全期間) をサーバー集計から取得する。
 *
 * `enabled` が true になるたびに取り直す。ランキング画面を開き直せば、
 * 閉じている間の発言も反映される。閉じている間は通信しない。
 */
export function useRoomRanking(roomId: RoomId, enabled: boolean): RoomRankingState {
  const [state, setState] = useState<RoomRankingState>({
    ranking: [],
    isLoading: enabled,
    hasError: false,
  });

  // 開いた / 部屋が変わった時点で前回の結果を捨てて読み込み中に戻す。
  // effect 内で setState すると余分な render が走るため render 中に検知する
  // (useResetOnChange = 公式推奨「前回値検知」パターン)
  useResetOnChange(enabled ? roomId : null, (key) => {
    setState({ ranking: [], isLoading: key !== null, hasError: false });
  });

  useEffect(() => {
    if (!enabled) return;
    let ignore = false;
    loadChatRanking(roomId).then(
      (ranking) => {
        if (!ignore) setState({ ranking, isLoading: false, hasError: false });
      },
      () => {
        if (!ignore) setState({ ranking: [], isLoading: false, hasError: true });
      }
    );
    return () => {
      ignore = true;
    };
  }, [roomId, enabled]);

  return state;
}
