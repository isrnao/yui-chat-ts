import type { Chat } from '@features/chat/types';
import { splitAdminMessage } from './adminMessage';

export type IpFilterResult = {
  /** 残った発言。元の順序のまま */
  visible: readonly Chat[];
  /** 伏せ字の IP ごとの、隠した発言の数 */
  hiddenCounts: ReadonlyMap<string, number>;
  /** 伏せ字の IP ごとの、隠した発言の「おなまえ」。新しい発言の順で重複なし */
  hiddenNames: ReadonlyMap<string, readonly string[]>;
  hiddenTotal: number;
};

const NO_HIDDEN: ReadonlyMap<string, number> = new Map();
const NO_NAMES: ReadonlyMap<string, readonly string[]> = new Map();

/**
 * 隠した発言の「おなまえ」。管理人の入退室メッセージは本文の「○○さん、…」から入室者の名前を取る。
 * 巫女（おみくじの結果）は呼び出した人の名前を持たないので数えない
 */
function speakerName(chat: Chat): string | null {
  const kind = chat.metadata?.kind;
  if (kind === 'fortune') return null;
  if (kind === 'admin') return splitAdminMessage(chat.message)?.userName || null;
  return chat.name || null;
}

/** ログの中で、その伏せ字の IP から発言している「おなまえ」（新しい順、重複なし）。フィルタした時点の保存に使う */
export function namesForIp(chatLog: readonly Chat[], ip: string): string[] {
  const names = new Set<string>();
  for (const chat of chatLog) {
    if (chat.ip_masked !== ip) continue;
    const name = speakerName(chat);
    if (name) names.add(name);
  }
  return [...names];
}

/** 今のログで隠れている名前を先に、保存した名前をその後に、重複なく並べる（Filter_Panel の表示） */
export function mergeNames(
  current: readonly string[] | undefined,
  saved: readonly string[] | undefined
): string[] {
  return [...new Set([...(current ?? []), ...(saved ?? [])])];
}

/**
 * フィルタ中の伏せ字の IP と一致する発言を除く（.kiro/specs/chat-ip-mute Requirement 5）。
 * 管理人の入退室メッセージも ip_masked が一致すれば隠す（起点にはできないが、入室者本人の IP を持つ）。
 * フィルタが空のときは受け取った配列をそのまま返す（コピーしない）。
 */
export function filterByIp(
  chatLog: readonly Chat[],
  filtered: ReadonlySet<string>
): IpFilterResult {
  if (filtered.size === 0) {
    return { visible: chatLog, hiddenCounts: NO_HIDDEN, hiddenNames: NO_NAMES, hiddenTotal: 0 };
  }

  const visible: Chat[] = [];
  const hiddenCounts = new Map<string, number>();
  const names = new Map<string, Set<string>>();
  for (const chat of chatLog) {
    const ip = chat.ip_masked;
    if (ip && filtered.has(ip)) {
      hiddenCounts.set(ip, (hiddenCounts.get(ip) ?? 0) + 1);
      const name = speakerName(chat);
      if (name) names.set(ip, (names.get(ip) ?? new Set()).add(name));
    } else {
      visible.push(chat);
    }
  }
  const hiddenNames = new Map([...names].map(([ip, set]) => [ip, [...set]] as const));
  return { visible, hiddenCounts, hiddenNames, hiddenTotal: chatLog.length - visible.length };
}
