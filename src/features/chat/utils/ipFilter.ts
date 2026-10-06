import type { Chat } from '@features/chat/types';
import { readAdminEvent, splitAdminMessage } from './adminMessage';

/** 絞り込みに使うフィルタ。IP だけの Set を渡してもよい */
export type ChatFilterSpec = {
  /** 伏せ字の IP */
  set: ReadonlySet<string>;
  /** 名前（発言と入退室の名前が一致する発言を隠す） */
  names?: ReadonlySet<string>;
  /** 言葉（それを含む発言を隠す） */
  words?: readonly string[];
};

export type IpFilterResult = {
  /** 残った発言。元の順序のまま */
  visible: readonly Chat[];
  /** フィルタ（filterKey）ごとの、隠した発言の数。1 つの発言が複数のフィルタに当たれば、それぞれで数える */
  hiddenCounts: ReadonlyMap<string, number>;
  /** 伏せ字の IP ごとの、隠した発言の「おなまえ」。新しい発言の順で重複なし */
  hiddenNames: ReadonlyMap<string, readonly string[]>;
  hiddenTotal: number;
};

const NO_HIDDEN: ReadonlyMap<string, number> = new Map();
const NO_NAMES: ReadonlyMap<string, readonly string[]> = new Map();
const NO_SET: ReadonlySet<string> = new Set();

/**
 * 発言の「おなまえ」。管理人の入退室メッセージは本文の「○○さん、…」から入室者の名前を取る。
 * 巫女（おみくじの結果）は呼び出した人の名前を持たないので null
 */
export function speakerName(chat: Chat): string | null {
  const kind = chat.metadata?.kind;
  if (kind === 'fortune') return null;
  // 入退室は metadata の構造で読み、構造の無い古い行だけ本文で読む（Issue #183。表示・参加者一覧と同じ）
  if (kind === 'admin') {
    return readAdminEvent(chat)?.name || splitAdminMessage(chat.message)?.userName || null;
  }
  return chat.name || null;
}

/** 言葉を比べるための形。全角と半角（NFKC）と、英字の大文字と小文字を区別しない */
export function normalizeForMatch(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

/** 言葉のフィルタを当てる本文。管理人の入退室メッセージは定型文なので当てない */
function wordTarget(chat: Chat): string | null {
  return chat.metadata?.kind === 'admin' ? null : normalizeForMatch(chat.message);
}

/** ログの中で、その言葉を含む発言の数（言葉のフィルタの確認の窓に出す） */
export function countWordMatches(chatLog: readonly Chat[], word: string): number {
  const target = normalizeForMatch(word.trim());
  if (!target) return 0;
  return chatLog.filter((chat) => wordTarget(chat)?.includes(target)).length;
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

/** 今のログで隠れている名前を先に、保存した名前をその後に、重複なく並べる（フィルタの一覧の表示） */
export function mergeNames(
  current: readonly string[] | undefined,
  saved: readonly string[] | undefined
): string[] {
  return [...new Set([...(current ?? []), ...(saved ?? [])])];
}

/**
 * フィルタに当たる発言を除く（.kiro/specs/chat-ip-mute Requirement 5・9）。
 * - IP: ip_masked が一致する発言（管理人の入退室と巫女も、呼び出した人の IP を持つので隠す）
 * - 名前: 発言者の名前、または管理人の入退室メッセージの入室者の名前が一致する発言
 * - 言葉: 本文がその言葉を含む発言（全角と半角、英字の大文字と小文字を区別しない。管理人の入退室は除く）
 * フィルタが空のときは受け取った配列をそのまま返す（コピーしない）。
 */
export function filterByIp(
  chatLog: readonly Chat[],
  filter: ChatFilterSpec | ReadonlySet<string>
): IpFilterResult {
  const spec: ChatFilterSpec = filter instanceof Set ? { set: filter } : (filter as ChatFilterSpec);
  const ips = spec.set;
  const names = spec.names ?? NO_SET;
  const words = (spec.words ?? []).map((word) => ({ word, target: normalizeForMatch(word) }));
  if (ips.size === 0 && names.size === 0 && words.length === 0) {
    return { visible: chatLog, hiddenCounts: NO_HIDDEN, hiddenNames: NO_NAMES, hiddenTotal: 0 };
  }

  const visible: Chat[] = [];
  const hiddenCounts = new Map<string, number>();
  const ipNames = new Map<string, Set<string>>();
  const count = (key: string) => hiddenCounts.set(key, (hiddenCounts.get(key) ?? 0) + 1);

  for (const chat of chatLog) {
    let hidden = false;
    const ip = chat.ip_masked;
    const name = speakerName(chat);
    if (ip && ips.has(ip)) {
      hidden = true;
      count(`ip:${ip}`);
      if (name) ipNames.set(ip, (ipNames.get(ip) ?? new Set()).add(name));
    }
    if (name && names.has(name)) {
      hidden = true;
      count(`name:${name}`);
    }
    if (words.length > 0) {
      const text = wordTarget(chat);
      for (const { word, target } of words) {
        if (text?.includes(target)) {
          hidden = true;
          count(`word:${word}`);
        }
      }
    }
    if (!hidden) visible.push(chat);
  }
  const hiddenNames = new Map([...ipNames].map(([ip, set]) => [ip, [...set]] as const));
  return { visible, hiddenCounts, hiddenNames, hiddenTotal: chatLog.length - visible.length };
}
