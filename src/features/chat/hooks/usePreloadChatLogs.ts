import { loadInitialChatLogs, loadChatLogsWithPaging } from '@features/chat/api/chatApi';
import type { Chat } from '@features/chat/types';
import type { RoomId } from '@features/chat/rooms';

/**
 * チャットログプリロード + 初回ページ取得の Suspense リソース。
 *
 * - `React.cache()` は React Server Components 専用で Client では呼び出しごとに関数が
 *   再実行される (= `useMemo` と同じ問題が残る) ため、module-level Map で promise を
 *   安定化させる。同 key の連続呼び出しでは同じ promise インスタンスを返す。
 * - consumer は `React.use(...)` で Suspense 境界から読み出す前提。
 * - render 中 I/O 発火 (Copilot PR #54 review #3) を解消するため、`useMemo` ベース
 *   実装からの置き換え。
 */

const preloadCache = new Map<RoomId, Promise<Chat[]>>();

function getPreloadPromise(roomId: RoomId): Promise<Chat[]> {
  let promise = preloadCache.get(roomId);
  if (promise == null) {
    promise = loadInitialChatLogs(roomId, 100).catch(() => {
      preloadCache.delete(roomId);
      return [] as Chat[];
    });
    preloadCache.set(roomId, promise);
  }
  return promise;
}

const pagingCache = new Map<string, Promise<{ data: Chat[]; hasMore: boolean }>>();

function pagingKey(roomId: RoomId, limit: number, reloadToken: number): string {
  return `${roomId}|${limit}|${reloadToken}`;
}

/**
 * `useResetOnChange` 等で windowRows / reloadToken が変わると新しい key で再 fetch される。
 * 古い key の entry はメモリリークを防ぐため同 prefix を一掃する。
 */
export function fetchInitialChatLogPage(
  roomId: RoomId,
  limit: number,
  reloadToken: number
): Promise<{ data: Chat[]; hasMore: boolean }> {
  const key = pagingKey(roomId, limit, reloadToken);
  let promise = pagingCache.get(key);
  if (promise == null) {
    const prefix = `${roomId}|${limit}|`;
    for (const k of pagingCache.keys()) {
      if (k.startsWith(prefix) && k !== key) {
        pagingCache.delete(k);
      }
    }
    promise = getPreloadPromise(roomId)
      .then(() => loadChatLogsWithPaging(roomId, limit, 0, true))
      .catch(() => {
        pagingCache.delete(key);
        return { data: [] as Chat[], hasMore: false };
      });
    pagingCache.set(key, promise);
  }
  return promise;
}

/** 後方互換用 (PR1 以前の API)。Suspense 境界から `React.use(...)` で待機する。 */
export function usePreloadChatLogs(roomId: RoomId): Promise<Chat[]> {
  return getPreloadPromise(roomId);
}
