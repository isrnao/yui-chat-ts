import { createPersistentStore } from '@shared/utils/persistentStore';

/**
 * 発言復元用の localStorage ストア。
 * 1 つの STORAGE_KEY に roomId 別のマップを JSON で保存し、
 * 他 roomId の draft を壊さずに共存させる。
 *
 * clearDraft は本 spec では実装しない（呼び出し箇所が無いため）。
 *
 * 読み書きは Persistent_Store（useSyncExternalStore で読める localStorage のストア）で行う
 * （.kiro/specs/react-2026-refactoring Requirement 9）。
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

/** 1 件の下書きが有効か。バージョン・更新時刻（未来でない / 1 年以内）・本文の長さを確かめる */
function isValidDraft(entry: unknown, now: number): entry is ChanariDraft {
  if (typeof entry !== 'object' || entry === null) return false;
  const draft = entry as Partial<ChanariDraft>;
  if (draft.version !== 1 || typeof draft.roomId !== 'string') return false;
  if (typeof draft.updatedAt !== 'number') return false;
  if (draft.updatedAt > now || draft.updatedAt < now - ONE_YEAR_MS) return false;
  if (draft.lastMessage != null && draft.lastMessage.length > 1000) return false;
  return true;
}

/**
 * roomId ごとの下書きのストア。読み込むときに無効な下書きを落とす
 * （有効期限の判定に現在時刻を使うが、生の文字列が変わるまで結果は使い回される）。
 */
export const draftsStore = createPersistentStore<DraftMap>({
  key: STORAGE_KEY,
  defaults: {},
  parse: (value) => {
    if (typeof value !== 'object' || value === null) return {};
    const now = Date.now();
    const valid: DraftMap = {};
    for (const [roomId, entry] of Object.entries(value as Record<string, unknown>)) {
      if (isValidDraft(entry, now)) valid[roomId] = entry;
    }
    return valid;
  },
});

/**
 * draft を保存する（既存の値に上書きせず、渡した項目だけを差し替える）。
 * localStorage が使えないときはメモリ上の値だけ更新する。
 */
export function saveDraft(draft: Omit<ChanariDraft, 'version' | 'updatedAt'>): void {
  draftsStore.update((map) => ({
    ...map,
    [draft.roomId]: { ...map[draft.roomId], ...draft, version: 1, updatedAt: Date.now() },
  }));
}

/** 指定 roomId の有効な draft。なければ null */
export function loadDraft(roomId: string): ChanariDraft | null {
  return draftsStore.getSnapshot()[roomId] ?? null;
}
