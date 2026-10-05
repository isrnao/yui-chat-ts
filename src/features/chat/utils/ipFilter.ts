import type { Chat } from '@features/chat/types';

export type IpFilterResult = {
  /** 残った発言。元の順序のまま */
  visible: readonly Chat[];
  /** 伏せ字の IP ごとの、隠した発言の数 */
  hiddenCounts: ReadonlyMap<string, number>;
  hiddenTotal: number;
};

const NO_HIDDEN: ReadonlyMap<string, number> = new Map();

/**
 * フィルタ中の伏せ字の IP と一致する発言を除く（.kiro/specs/chat-ip-mute Requirement 5）。
 * 管理人の入退室メッセージも ip_masked が一致すれば隠す（起点にはできないが、入室者本人の IP を持つ）。
 * フィルタが空のときは受け取った配列をそのまま返す（コピーしない）。
 */
export function filterByIp(
  chatLog: readonly Chat[],
  filtered: ReadonlySet<string>
): IpFilterResult {
  if (filtered.size === 0) return { visible: chatLog, hiddenCounts: NO_HIDDEN, hiddenTotal: 0 };

  const visible: Chat[] = [];
  const hiddenCounts = new Map<string, number>();
  for (const chat of chatLog) {
    if (chat.ip_masked && filtered.has(chat.ip_masked)) {
      hiddenCounts.set(chat.ip_masked, (hiddenCounts.get(chat.ip_masked) ?? 0) + 1);
    } else {
      visible.push(chat);
    }
  }
  return { visible, hiddenCounts, hiddenTotal: chatLog.length - visible.length };
}
