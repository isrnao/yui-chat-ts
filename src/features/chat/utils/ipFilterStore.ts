import { createPersistentStore } from '@shared/utils/persistentStore';

/**
 * 閲覧者がフィルタ（非表示に）した伏せ字の IP の一覧（Filter_List）。
 * 閲覧者のブラウザの中だけの設定で、通常の部屋と全部屋まとめで共有する
 * （.kiro/specs/chat-ip-mute Requirement 6）。
 */

const STORAGE_KEY = 'yui-chat-muted-ips';
/** 保存する件数の上限。超えたら古いものから捨てる */
export const FILTER_LIST_LIMIT = 50;
/** 1 つの IP について保存する「おなまえ」の上限 */
export const FILTER_NAMES_LIMIT = 10;

/** フィルタした IP と、フィルタした時点でその IP から発言していた「おなまえ」（新しい順） */
export type FilterEntry = { ip: string; names: readonly string[] };

const EMPTY: readonly FilterEntry[] = [];

/**
 * フィルタの起点にできる伏せ字の IP か。空文字と `*` は IP が分からない発言
 * （mask_ip() が形を判定できなかったもの）なので、まとめて隠さないよう除く
 */
export function isFilterableIp(ip: string | undefined | null): ip is string {
  return typeof ip === 'string' && ip !== '' && ip !== '*';
}

/** 文字列だけを残し、重複を除き（最初に現れたものを残す）、上限までにする */
function normalizeNames(names: readonly unknown[]): readonly string[] {
  const strings = names.filter((name): name is string => typeof name === 'string' && name !== '');
  return [...new Set(strings)].slice(0, FILTER_NAMES_LIMIT);
}

/** IP の重複を除き（最初に現れたものを残す）、末尾の FILTER_LIST_LIMIT 件にする */
function normalize(entries: readonly FilterEntry[]): readonly FilterEntry[] {
  const seen = new Set<string>();
  const unique = entries.filter(({ ip }) => !seen.has(ip) && seen.add(ip));
  return unique.length > FILTER_LIST_LIMIT ? unique.slice(-FILTER_LIST_LIMIT) : unique;
}

/**
 * 保存値の 1 件を読む。名前を保存する前の形（IP の文字列だけ）も読める
 */
function parseEntry(value: unknown): FilterEntry | null {
  if (typeof value === 'string') return isFilterableIp(value) ? { ip: value, names: [] } : null;
  if (typeof value !== 'object' || value === null) return null;
  const { ip, names } = value as { ip?: unknown; names?: unknown };
  if (typeof ip !== 'string' || !isFilterableIp(ip)) return null;
  return { ip, names: Array.isArray(names) ? normalizeNames(names) : [] };
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
  return getSnapshot().map(({ ip }) => ip);
}

/**
 * 末尾に追加する。names はフィルタした時点でその IP から発言していた「おなまえ」。
 * すでにある IP なら、まだない名前だけを前に足す
 */
export function addFilteredIp(ip: string, names: readonly string[] = []): void {
  if (!isFilterableIp(ip)) return;
  store.update((current) => {
    const existing = current.find((entry) => entry.ip === ip);
    if (!existing) return normalize([...current, { ip, names: normalizeNames(names) }]);
    // まだない名前だけを前に足す。すでにある名前の並びは変えない
    const added = normalizeNames(names).filter((name) => !existing.names.includes(name));
    if (added.length === 0) return current;
    const merged = normalizeNames([...added, ...existing.names]);
    return current.map((entry) => (entry === existing ? { ip, names: merged } : entry));
  });
}

export function removeFilteredIp(ip: string): void {
  store.update((current) => current.filter((entry) => entry.ip !== ip));
}

export function clearFilteredIps(): void {
  store.update(EMPTY);
}
