/**
 * 発言復元用の localStorage ストア。
 * 1 つの STORAGE_KEY に roomId 別のマップを JSON で保存し、
 * 他 roomId の draft を壊さずに共存させる。
 *
 * clearDraft は本 spec では実装しない（呼び出し箇所が無いため）。
 */

export const STORAGE_KEY = 'chanari-retro-chat-ui:draft:v1';

export const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export const RELOAD_SECONDS_OPTIONS = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 45, 60, 95, 120,
] as const;

export type ReloadSeconds = (typeof RELOAD_SECONDS_OPTIONS)[number];

export const DEFAULT_RELOAD_SECONDS: ReloadSeconds = 7;

export type ChanariDraft = {
  version: 1;
  roomId: string;
  name?: string;
  nameColor?: string;
  speechColor?: string;
  lastMessage?: string;
  updatedAt: number;
};

type DraftMap = Record<string, ChanariDraft>;

/**
 * localStorage が利用可能かどうかを判定する。
 * SSR / Private Mode / SecurityError 等を吸収する。
 */
export function canUseLocalStorage(): boolean {
  try {
    const testKey = '__chanari_ls_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * draft を localStorage に保存する。
 * localStorage が利用不能、または書き込み時に例外が発生した場合は no-op。
 */
export function saveDraft(draft: Omit<ChanariDraft, 'version' | 'updatedAt'>): void {
  if (!canUseLocalStorage()) return;

  try {
    let map: DraftMap = {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        map = JSON.parse(raw) as DraftMap;
      } catch {
        // 既存データが壊れていたら空マップで上書き
        map = {};
      }
    }

    const entry: ChanariDraft = {
      ...draft,
      version: 1,
      updatedAt: Date.now(),
    };

    map[draft.roomId] = entry;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // QuotaExceededError 等 → no-op
  }
}

/**
 * 指定 roomId の draft を localStorage から読み込む。
 * バリデーションに失敗した場合は null を返す。
 */
export function loadDraft(roomId: string): ChanariDraft | null {
  if (!canUseLocalStorage()) return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const map: DraftMap = JSON.parse(raw) as DraftMap;
    const entry = map[roomId];
    if (!entry) return null;

    // version check
    if (entry.version !== 1) return null;

    // updatedAt validation
    const now = Date.now();
    if (entry.updatedAt > now) return null;
    if (entry.updatedAt < now - ONE_YEAR_MS) return null;

    // lastMessage length check
    if (entry.lastMessage != null && entry.lastMessage.length > 1000) {
      return null;
    }

    return entry;
  } catch {
    // JSON.parse failure or any other error
    return null;
  }
}
