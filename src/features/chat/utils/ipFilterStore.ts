import { createPersistentStore } from '@shared/utils/persistentStore';

/**
 * 閲覧者がフィルタ（非表示に）したものの一覧（Filter_List）。伏せ字の IP・名前・言葉の 3 種類を持つ。
 * 閲覧者のブラウザの中だけの設定で、通常の部屋と全部屋まとめで共有する
 * （.kiro/specs/chat-ip-mute Requirement 6・9）。
 */

const STORAGE_KEY = 'yui-chat-muted-ips';
/** 保存する件数の上限（3 種類の合計）。超えたら古いものから捨てる */
export const FILTER_LIST_LIMIT = 50;
/** 1 つの IP について保存する「おなまえ」の上限 */
export const FILTER_NAMES_LIMIT = 10;
/** 言葉のフィルタの長さの上限 */
export const FILTER_WORD_MAX_LENGTH = 50;

/**
 * フィルタの 1 件。
 * - ip: 伏せ字の IP。names はフィルタした時点でその IP から発言していた「おなまえ」（新しい順）
 * - name: 名前（発言と入退室の名前が一致する発言を隠す）
 * - word: 言葉（それを含む発言を隠す）
 */
export type FilterEntry =
  | { kind: 'ip'; ip: string; names: readonly string[] }
  | { kind: 'name'; name: string }
  | { kind: 'word'; word: string };

const EMPTY: readonly FilterEntry[] = [];

/** フィルタ 1 件を一意に表す文字列（解除・件数の数え分けに使う） */
export function filterKey(entry: FilterEntry): string {
  switch (entry.kind) {
    case 'ip':
      return `ip:${entry.ip}`;
    case 'name':
      return `name:${entry.name}`;
    case 'word':
      return `word:${entry.word}`;
  }
}

/**
 * フィルタの起点にできる伏せ字の IP か。空文字と `*` は IP が分からない発言
 * （mask_ip() が形を判定できなかったもの）なので、まとめて隠さないよう除く
 */
export function isFilterableIp(ip: string | undefined | null): ip is string {
  return typeof ip === 'string' && ip !== '' && ip !== '*';
}

/** 言葉のフィルタとして使える形に整える（前後の空白を除き、上限まで）。使えなければ空文字 */
export function normalizeFilterWord(word: string): string {
  return word.trim().slice(0, FILTER_WORD_MAX_LENGTH);
}

/** 文字列だけを残し、重複を除き（最初に現れたものを残す）、上限までにする */
function normalizeNames(names: readonly unknown[]): readonly string[] {
  const strings = names.filter((name): name is string => typeof name === 'string' && name !== '');
  return [...new Set(strings)].slice(0, FILTER_NAMES_LIMIT);
}

/** 重複を除き（最初に現れたものを残す）、末尾の FILTER_LIST_LIMIT 件にする */
function normalize(entries: readonly FilterEntry[]): readonly FilterEntry[] {
  const seen = new Set<string>();
  const unique = entries.filter((entry) => {
    const key = filterKey(entry);
    return !seen.has(key) && seen.add(key);
  });
  return unique.length > FILTER_LIST_LIMIT ? unique.slice(-FILTER_LIST_LIMIT) : unique;
}

/**
 * 保存値の 1 件を読む。種類を持つ前の形（IP の文字列だけ、`{ ip, names }`）も IP として読む
 */
function parseEntry(value: unknown): FilterEntry | null {
  if (typeof value === 'string') {
    return isFilterableIp(value) ? { kind: 'ip', ip: value, names: [] } : null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { kind, ip, names, name, word } = value as Record<string, unknown>;
  if (kind === 'name') {
    return typeof name === 'string' && name.trim() !== '' ? { kind: 'name', name } : null;
  }
  if (kind === 'word') {
    const normalized = typeof word === 'string' ? normalizeFilterWord(word) : '';
    return normalized ? { kind: 'word', word: normalized } : null;
  }
  if (kind !== undefined && kind !== 'ip') return null;
  if (typeof ip !== 'string' || !isFilterableIp(ip)) return null;
  return { kind: 'ip', ip, names: Array.isArray(names) ? normalizeNames(names) : [] };
}

const store = createPersistentStore<readonly FilterEntry[]>({
  key: STORAGE_KEY,
  defaults: EMPTY,
  // 手で書き換えられた値や古い形でも、使えるものだけを残して読む
  parse: (value) =>
    Array.isArray(value)
      ? normalize(value.map(parseEntry).filter((entry) => entry !== null))
      : EMPTY,
});

export const subscribe = store.subscribe;
export const getSnapshot = store.getSnapshot;
export const getServerSnapshot = store.getServerSnapshot;

/** フィルタしている IP（追加した順） */
export function getFilteredIps(): string[] {
  return getSnapshot().flatMap((entry) => (entry.kind === 'ip' ? [entry.ip] : []));
}

/**
 * IP を末尾に追加する。names はフィルタした時点でその IP から発言していた「おなまえ」。
 * すでにある IP なら、まだない名前だけを前に足す
 */
export function addFilteredIp(ip: string, names: readonly string[] = []): void {
  if (!isFilterableIp(ip)) return;
  store.update((current) => {
    const existing = current.find((entry) => entry.kind === 'ip' && entry.ip === ip);
    if (!existing || existing.kind !== 'ip') {
      return normalize([...current, { kind: 'ip', ip, names: normalizeNames(names) }]);
    }
    // まだない名前だけを前に足す。すでにある名前の並びは変えない
    const added = normalizeNames(names).filter((name) => !existing.names.includes(name));
    if (added.length === 0) return current;
    const merged = normalizeNames([...added, ...existing.names]);
    return current.map((entry) => (entry === existing ? { kind: 'ip', ip, names: merged } : entry));
  });
}

/** 名前を末尾に追加する。すでにあれば何もしない */
export function addFilteredName(name: string): void {
  if (name.trim() === '') return;
  store.update((current) => {
    const key = filterKey({ kind: 'name', name });
    if (current.some((entry) => filterKey(entry) === key)) return current;
    return normalize([...current, { kind: 'name', name }]);
  });
}

/** 言葉を末尾に追加する。前後の空白を除き、空なら何もしない。すでにあれば何もしない */
export function addFilteredWord(word: string): void {
  const normalized = normalizeFilterWord(word);
  if (!normalized) return;
  store.update((current) => {
    const key = filterKey({ kind: 'word', word: normalized });
    if (current.some((entry) => filterKey(entry) === key)) return current;
    return normalize([...current, { kind: 'word', word: normalized }]);
  });
}

/** filterKey で 1 件を取り除く */
export function removeFilter(key: string): void {
  store.update((current) => current.filter((entry) => filterKey(entry) !== key));
}

export function removeFilteredIp(ip: string): void {
  removeFilter(`ip:${ip}`);
}

/** すべてのフィルタを取り除く */
export function clearFilters(): void {
  store.update(EMPTY);
}
