import type { Chat } from '@features/chat/types';
import { compareChatsNewestFirst, sortChatsByTime } from '@shared/utils/uuid';

const MAX_AGGREGATED_LOG = 2000;

/**
 * チャットログのマージ純粋関数。
 * - uuid による重複排除（同一 uuid は置換。incoming が state を上書きする）
 * - uuid v7 降順の整列
 * - 2000 件キャップ（超過時は最古から破棄）
 * - Source_Room_Id（room_id）を保持
 *
 * 全部屋まとめ (Aggregated_Log) と部屋単位のログの双方で使う。
 * state は新しい順に並んでいる前提（Room_Log_Store が持つログは常にこの関数か取得結果で作られる）。
 */
export function mergeChatLogByUuid(state: Chat[], incoming: Chat | Chat[]): Chat[] {
  const incomingArray = Array.isArray(incoming) ? incoming : [incoming];
  if (incomingArray.length === 0) return state;
  if (incomingArray.length === 1) return insertChat(state, incomingArray[0]!);

  const map = new Map<string, Chat>();
  for (const c of state) map.set(c.uuid, c);
  for (const c of incomingArray) map.set(c.uuid, c);

  const merged = sortChatsByTime(Array.from(map.values()));
  return merged.slice(0, MAX_AGGREGATED_LOG);
}

/**
 * 1 件の合流。Realtime で発言が届くたびに呼ばれるので、ログ全体を並べ直さず、
 * 挿入する位置だけを二分探索で探す（.kiro/specs/react-2026-refactoring Requirement 17）。
 * 結果は、全体を並べ直す場合（上の Map + 安定ソート）と同じになる。
 */
function insertChat(state: Chat[], chat: Chat): Chat[] {
  const existing = state.findIndex((c) => c.uuid === chat.uuid);
  const rest = existing === -1 ? state : state.filter((_, i) => i !== existing);
  // 並び順が chat と等しい行の範囲 [lower, upper) を探す
  const lower = searchFrom(rest, (c) => compareChatsNewestFirst(c, chat) >= 0);
  const upper = searchFrom(rest, (c) => compareChatsNewestFirst(c, chat) > 0);
  // 等しい行どうしの順番は、安定ソートと同じく元の並びを保つ。新しい行は範囲の末尾
  // （Map の末尾に足してから並べるのと同じ）、置き換える行は元の位置に近いところへ入る
  const at = existing === -1 ? upper : Math.min(Math.max(existing, lower), upper);
  if (at >= MAX_AGGREGATED_LOG) return rest.slice(0, MAX_AGGREGATED_LOG);
  const next = rest.slice(0, MAX_AGGREGATED_LOG - 1);
  next.splice(at, 0, chat);
  return next;
}

/** 並んだ配列で、predicate が初めて true になる位置（なければ length）を二分探索で返す */
function searchFrom(chats: Chat[], predicate: (chat: Chat) => boolean): number {
  let low = 0;
  let high = chats.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (predicate(chats[mid]!)) high = mid;
    else low = mid + 1;
  }
  return low;
}
