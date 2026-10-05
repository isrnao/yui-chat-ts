import { createPersistentStore } from '@shared/utils/persistentStore';

/**
 * 閲覧者がフィルタ（非表示に）した伏せ字の IP の一覧（Filter_List）。
 * 閲覧者のブラウザの中だけの設定で、通常の部屋と全部屋まとめで共有する
 * （.kiro/specs/chat-ip-mute Requirement 6）。
 */

const STORAGE_KEY = 'yui-chat-muted-ips';
/** 保存する件数の上限。超えたら古いものから捨てる */
export const FILTER_LIST_LIMIT = 50;

const EMPTY: readonly string[] = [];

/**
 * フィルタの起点にできる伏せ字の IP か。空文字と `*` は IP が分からない発言
 * （mask_ip() が形を判定できなかったもの）なので、まとめて隠さないよう除く
 */
export function isFilterableIp(ip: string | undefined | null): ip is string {
  return typeof ip === 'string' && ip !== '' && ip !== '*';
}

/** 重複を除き（最初に現れたものを残す）、末尾の FILTER_LIST_LIMIT 件にする */
function normalize(ips: readonly string[]): readonly string[] {
  const unique = [...new Set(ips)];
  return unique.length > FILTER_LIST_LIMIT ? unique.slice(-FILTER_LIST_LIMIT) : unique;
}

const store = createPersistentStore<readonly string[]>({
  key: STORAGE_KEY,
  defaults: EMPTY,
  // 手で書き換えられた値や古い形でも、使える文字列だけを残して読む
  parse: (value) => (Array.isArray(value) ? normalize(value.filter(isFilterableIp)) : EMPTY),
});

export const subscribe = store.subscribe;
export const getSnapshot = store.getSnapshot;
export const getServerSnapshot = store.getServerSnapshot;

/** 末尾に追加する。すでにあれば何もしない */
export function addFilteredIp(ip: string): void {
  if (!isFilterableIp(ip)) return;
  store.update((current) => (current.includes(ip) ? current : normalize([...current, ip])));
}

export function removeFilteredIp(ip: string): void {
  store.update((current) => current.filter((item) => item !== ip));
}

export function clearFilteredIps(): void {
  store.update(EMPTY);
}
