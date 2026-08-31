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
 * - 取得失敗は握りつぶさず reject を伝播させる。空配列へ変換していた頃は
 *   ErrorBoundary が機能せず、「エラー」と「発言が 0 件」を区別できなかった。
 *   失敗した promise はキャッシュから外すので、再マウント / 再読込で再試行できる。
 */

const preloadCache = new Map<RoomId, Promise<Chat[]>>();

function getPreloadPromise(roomId: RoomId): Promise<Chat[]> {
  let promise = preloadCache.get(roomId);
  if (promise == null) {
    promise = loadInitialChatLogs(roomId, 100).catch((error: unknown): never => {
      preloadCache.delete(roomId);
      throw error;
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
 *
 * `reloadToken > 0`（= 利用者が明示的に再読込した）ときは、chatLogResource の
 * 5 分 TTL キャッシュを迂回して実際にネットワークから取り直す。キャッシュ付きのままだと
 * 「再読込」を押しても最大 5 分間は同じ snapshot が返り、その間に他ユーザーが発言していても
 * 反映されなかった。preload 側の promise も捨てて、次のマウントで古い snapshot を
 * 返さないようにする。
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
    const onError = (error: unknown): never => {
      pagingCache.delete(key);
      throw error;
    };
    if (reloadToken === 0) {
      promise = getPreloadPromise(roomId)
        .then(() => loadChatLogsWithPaging(roomId, limit, 0, true))
        .catch(onError);
    } else {
      preloadCache.delete(roomId);
      promise = loadChatLogsWithPaging(roomId, limit, 0, false).catch(onError);
    }
    pagingCache.set(key, promise);
  }
  return promise;
}

/** 後方互換用 (PR1 以前の API)。Suspense 境界から `React.use(...)` で待機する。 */
export function usePreloadChatLogs(roomId: RoomId): Promise<Chat[]> {
  return getPreloadPromise(roomId);
}
