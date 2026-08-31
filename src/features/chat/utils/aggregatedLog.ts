import type { Chat } from '@features/chat/types';
import { sortChatsByTime } from '@shared/utils/uuid';

const MAX_AGGREGATED_LOG = 2000;

/**
 * チャットログのマージ純粋関数。
 * - uuid による重複排除（同一 uuid は置換。incoming が state を上書きする）
 * - uuid v7 降順の整列
 * - 2000 件キャップ（超過時は最古から破棄）
 * - Source_Room_Id（room_id）を保持
 *
 * 全部屋まとめ (Aggregated_Log) と部屋単位のログの双方で使う。
 */
export function mergeChatLogByUuid(state: Chat[], incoming: Chat | Chat[]): Chat[] {
  const incomingArray = Array.isArray(incoming) ? incoming : [incoming];
  if (incomingArray.length === 0) return state;

  const map = new Map<string, Chat>();
  for (const c of state) map.set(c.uuid, c);
  for (const c of incomingArray) map.set(c.uuid, c);

  const merged = sortChatsByTime(Array.from(map.values()));
  return merged.slice(0, MAX_AGGREGATED_LOG);
}
