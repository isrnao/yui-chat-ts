import { useEffect, useState } from 'react';
import { loadChatRanking } from '@features/chat/api/chatApi';
import type { RankingEntry } from '@features/chat/utils/chatRanking';
import { useResetOnChange } from '@shared/hooks/useResetOnChange';
import type { RoomId } from '@features/chat/rooms';

/**
 * 取得がこれより長引いたときだけ「読み込み中」を出す。
 * 数十 ms で返る取得でも毎回表示すると、一瞬だけ文言が出てすぐ消えるチラつきになる。
 */
export const RANKING_LOADING_DELAY_MS = 300;

export type RoomRankingState = {
  /**
   * 表示するランキング。この部屋でまだ一度も取得できていなければ null。
   * 開き直したときは取り直しが終わるまで前回の結果を返し続ける (stale-while-revalidate)。
   */
  ranking: RankingEntry[] | null;
  /** 読み込み中表示を出すか。取得が RANKING_LOADING_DELAY_MS を超えたときだけ true */
  isLoading: boolean;
  /** 直近の取得が失敗したか */
  hasError: boolean;
};

const EMPTY: RoomRankingState = { ranking: null, isLoading: false, hasError: false };

/**
 * 部屋の発言ランキング (全期間) をサーバー集計から取得する。
 *
 * `enabled` が true になるたびに取り直す。ランキング画面を開き直せば、
 * 閉じている間の発言も反映される。閉じている間は通信しない。
 *
 * チラつき対策:
 * - 開き直したときは前回の結果をそのまま出し、取り直しが終わったら差し替える
 *   (以前は毎回空にしてから「読み込み中」を出していた)
 * - 初回でも、取得が RANKING_LOADING_DELAY_MS 以内に返れば「読み込み中」は出さない
 */
export function useRoomRanking(roomId: RoomId, enabled: boolean): RoomRankingState {
  const [state, setState] = useState<RoomRankingState>(EMPTY);

  // 部屋が変わったら前の部屋の結果は出さない。
  // effect 内で setState すると余分な render が走るため render 中に検知する
  // (useResetOnChange = 公式推奨「前回値検知」パターン)
  useResetOnChange(roomId, () => {
    setState(EMPTY);
  });

  // 開き直したときは結果を残したまま、前回の失敗・読み込み表示だけ戻す
  useResetOnChange(enabled, (next) => {
    if (next) setState((prev) => ({ ...prev, isLoading: false, hasError: false }));
  });

  useEffect(() => {
    if (!enabled) return;
    let ignore = false;

    const timer = setTimeout(() => {
      if (!ignore) setState((prev) => ({ ...prev, isLoading: true }));
    }, RANKING_LOADING_DELAY_MS);

    loadChatRanking(roomId)
      .then(
        (ranking) => {
          if (!ignore) setState({ ranking, isLoading: false, hasError: false });
        },
        () => {
          // 前回の結果があればそれを出し続ける (表示側で判断する)
          if (!ignore) setState((prev) => ({ ...prev, isLoading: false, hasError: true }));
        }
      )
      .finally(() => clearTimeout(timer));

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [roomId, enabled]);

  return state;
}
