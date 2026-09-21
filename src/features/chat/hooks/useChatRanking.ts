import type { Chat } from '@features/chat/types';
import { aggregateChatRanking, type RankingEntry } from '@features/chat/utils/chatRanking';

export type { RankingEntry };

/**
 * 手元のチャットログを集計する。
 *
 * ランキング画面はサーバー集計 (useRoomRanking → chat_ranking ビュー) に移ったため、
 * ここは手元のログで数えたい場面 (オフライン時・テスト) 向けに残している。
 * 手元のログは直近分しか持たないので、全期間のランキングには使えない。
 */
// メモ化は React Compiler に任せる（手動の useMemo は不要）
export function useChatRanking(chatLog: Chat[]): RankingEntry[] {
  return aggregateChatRanking(chatLog);
}
