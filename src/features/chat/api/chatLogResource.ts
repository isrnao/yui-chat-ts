import type { Chat } from '@features/chat/types';
import { supabase } from '@shared/supabaseClient';
import { mockChatData, isOnline } from '@features/chat/utils/fallback';
import { normalizeChat } from '../utils/normalizeMetadata';
import { DEFAULT_ROOM_ID, type RoomId } from '../rooms';

const TABLE = 'chats';
const SELECT_COLUMNS = 'uuid,room_id,name,color,message,time,system,email,metadata';
const MAX_CHAT_LOG = 100;
const CACHE_DURATION = 5 * 60 * 1000;

interface CacheEntry {
  data: Chat[];
  /**
   * canonical snapshot がテーブルの全件を含んでいない (= さらに続きが存在する) かどうか。
   * フェッチ時に `MAX_CHAT_LOG + 1` 件取得して判定し、ここに同梱する。
   * オフラインフォールバック中などで判定できなかった場合は undefined。
   */
  hasMore: boolean | undefined;
  timestamp: number;
}

/** canonical snapshot 1 回分の戻り値 shape。 */
export type SnapshotResult = { data: Chat[]; hasMore: boolean | undefined };

const cache = new Map<RoomId, CacheEntry>();
const snapshotInflight = new Map<RoomId, Promise<SnapshotResult>>();
const pagingInflight = new Map<string, Promise<Chat[]>>();
const pagingHasMore = new Map<string, boolean>();
const cacheGeneration = new Map<RoomId, number>();
/**
 * canonical snapshot がテーブルの全件を含んでいない (= さらに続きが存在する) かどうか。
 * `loadChatLogsSnapshot` の戻り値と同期して更新される観測用 Map。
 * 競合に強い呼び出しは戻り値の `hasMore` を優先し、こちらは外部の単発参照に使う。
 * 未取得 / オフラインフォールバック中は undefined を返すよう delete される。
 */
const snapshotHasMore = new Map<RoomId, boolean>();

function startPerf(): number {
  return performance.now();
}

function endPerf(operation: string, startTime: number): void {
  const duration = performance.now() - startTime;
  if (duration > 3000) {
    console.warn(`Performance issue in ${operation}: ${duration.toFixed(0)}ms`);
  }
}

async function measureApiCall<T>(apiCall: () => Promise<T>): Promise<T> {
  return await apiCall();
}

async function retryApiCall<T>(
  apiCall: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await measureApiCall(apiCall);
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      const waitTime = delay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
  throw new Error('Max retries exceeded');
}

function getCachedChatLogs(roomId: RoomId): CacheEntry | null {
  return cache.get(roomId) ?? null;
}

function isFreshCache(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp < CACHE_DURATION;
}

function setCachedChatLogs(
  roomId: RoomId,
  data: Chat[],
  hasMore: boolean | undefined
): void {
  cache.set(roomId, {
    data: data.slice(0, MAX_CHAT_LOG),
    hasMore,
    timestamp: Date.now(),
  });
}

function getCacheGeneration(roomId: RoomId): number {
  return cacheGeneration.get(roomId) ?? 0;
}

function bumpCacheGeneration(roomId: RoomId): void {
  cacheGeneration.set(roomId, getCacheGeneration(roomId) + 1);
}

function getOfflineChatData(roomId: RoomId): Chat[] {
  return mockChatData.map((chat) => ({ ...chat, room_id: roomId }));
}

async function fetchSnapshot(
  roomId: RoomId,
  generation: number,
  startTime: number
): Promise<SnapshotResult> {
  return retryApiCall(async () => {
    if (!isOnline()) {
      endPerf('loadChatLogs-offline', startTime);
      // オフラインフォールバック中は「続きがあるか」を確定できない。
      // 戻り値で undefined を返しつつ、観測 Map も最新 generation なら "未取得" 状態にする。
      if (getCacheGeneration(roomId) === generation) {
        snapshotHasMore.delete(roomId);
      }
      return { data: getOfflineChatData(roomId), hasMore: undefined };
    }

    // hasMore を正確に返すため MAX_CHAT_LOG + 1 件取得し、超過分の有無で判定する。
    // 超過分は表示・キャッシュには含めない。
    const { data, error } = await supabase
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .eq('room_id', roomId)
      .eq('deleted', false)
      .order('uuid', { ascending: false })
      .limit(MAX_CHAT_LOG + 1);

    if (error) {
      if (error.code === '401' || error.message.includes('JWT')) {
        // 認証 fallback も同様に「未取得」扱いにする (復旧後に再判定したいため)。
        if (getCacheGeneration(roomId) === generation) {
          snapshotHasMore.delete(roomId);
        }
        return { data: getOfflineChatData(roomId), hasMore: undefined };
      }

      throw new Error(`Supabase error: ${error.message} (${error.code})`);
    }

    const rows = (data ?? []).map(normalizeChat);
    const hasMore = rows.length > MAX_CHAT_LOG;
    const chatData = hasMore ? rows.slice(0, MAX_CHAT_LOG) : rows;
    // generation が古いと判明した場合でも戻り値の hasMore は呼び出し元に渡す
    // (caller が取得結果と一緒に判定できるよう、stale 応答であっても情報を失わない)。
    if (getCacheGeneration(roomId) === generation) {
      setCachedChatLogs(roomId, chatData, hasMore);
      snapshotHasMore.set(roomId, hasMore);
    }
    endPerf('loadChatLogs-network', startTime);

    return { data: chatData, hasMore };
  });
}

function getPagingKey(roomId: RoomId, offset: number, limit: number): string {
  return `${roomId}|${offset}|${limit}`;
}

function getRoomIdFromPagingKey(key: string): RoomId {
  return key.split('|')[0] as RoomId;
}

async function fetchPage(
  roomId: RoomId,
  offset: number,
  limit: number,
  key: string,
  generation: number
): Promise<Chat[]> {
  return retryApiCall(async () => {
    const { data, count, error } = await supabase
      .from(TABLE)
      .select(SELECT_COLUMNS, { count: 'exact' })
      .eq('room_id', roomId)
      .eq('deleted', false)
      .order('uuid', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Supabase pagination error: ${error.message} (${error.code})`);
    }

    if (getCacheGeneration(roomId) !== generation) {
      return (data ?? []).map(normalizeChat);
    }

    if (typeof count === 'number') {
      pagingHasMore.set(key, count > offset + limit);
    } else {
      pagingHasMore.delete(key);
    }

    return (data ?? []).map(normalizeChat);
  });
}

/**
 * canonical snapshot を `{ data, hasMore }` shape で返す。
 * 取得タイミングで決まった hasMore を取得結果と必ずペアで返すため、
 * 取得中に `invalidateCache` が走って generation が変わっても
 * 呼び出し元はそのリクエスト固有の hasMore を信頼できる。
 */
export async function loadChatLogsSnapshot(
  roomId: RoomId = DEFAULT_ROOM_ID,
  useCache = true
): Promise<SnapshotResult> {
  const startTime = startPerf();

  const cached = getCachedChatLogs(roomId);
  if (useCache && cached && isFreshCache(cached)) {
    endPerf('loadChatLogs-cache', startTime);
    return { data: cached.data, hasMore: cached.hasMore };
  }

  const inflight = snapshotInflight.get(roomId);
  if (inflight) {
    return inflight;
  }

  const generation = getCacheGeneration(roomId);
  let request: Promise<SnapshotResult>;
  request = fetchSnapshot(roomId, generation, startTime).finally(() => {
    if (snapshotInflight.get(roomId) === request) {
      snapshotInflight.delete(roomId);
    }
  });
  snapshotInflight.set(roomId, request);
  return request;
}

/**
 * canonical snapshot を Chat[] のみで返す後方互換 API。
 * hasMore も必要な呼び出し元は `loadChatLogsSnapshot` を直接使うこと。
 */
export async function loadChatLogs(
  roomId: RoomId = DEFAULT_ROOM_ID,
  useCache = true
): Promise<Chat[]> {
  const { data } = await loadChatLogsSnapshot(roomId, useCache);
  return data;
}

export async function loadChatLogsWithPaging(
  roomId: RoomId = DEFAULT_ROOM_ID,
  offset = 0,
  limit = 50,
  useCache = true
): Promise<Chat[]> {
  if (offset === 0) {
    if (limit > MAX_CHAT_LOG) {
      console.warn(
        `loadChatLogsWithPaging requested ${limit} rows; canonical snapshot is capped at ${MAX_CHAT_LOG}`
      );
    }
    const { data } = await loadChatLogsSnapshot(roomId, useCache);
    return data.slice(0, limit);
  }

  const key = getPagingKey(roomId, offset, limit);
  const inflight = pagingInflight.get(key);
  if (inflight) {
    return inflight;
  }

  const generation = getCacheGeneration(roomId);
  let request: Promise<Chat[]>;
  request = fetchPage(roomId, offset, limit, key, generation).finally(() => {
    if (pagingInflight.get(key) === request) {
      pagingInflight.delete(key);
    }
  });
  pagingInflight.set(key, request);
  return request;
}

export async function loadInitialChatLogs(
  roomId: RoomId = DEFAULT_ROOM_ID,
  limit = MAX_CHAT_LOG,
  useCache = true
): Promise<Chat[]> {
  return loadChatLogsWithPaging(roomId, 0, limit, useCache);
}

export async function prefetchChatLogs(roomId: RoomId = DEFAULT_ROOM_ID): Promise<void> {
  try {
    await loadChatLogsSnapshot(roomId);
  } catch {
    // Best-effort prefetch only.
  }
}

export function invalidateCache(roomId?: RoomId): void {
  if (roomId) {
    cache.delete(roomId);
    snapshotInflight.delete(roomId);
    snapshotHasMore.delete(roomId);
    bumpCacheGeneration(roomId);
    for (const key of pagingInflight.keys()) {
      if (key.startsWith(`${roomId}|`)) {
        pagingInflight.delete(key);
      }
    }
    for (const key of pagingHasMore.keys()) {
      if (key.startsWith(`${roomId}|`)) {
        pagingHasMore.delete(key);
      }
    }
    return;
  }

  const roomsToInvalidate = new Set<RoomId>([
    ...cache.keys(),
    ...snapshotInflight.keys(),
    ...snapshotHasMore.keys(),
    ...cacheGeneration.keys(),
  ]);
  for (const key of pagingInflight.keys()) {
    roomsToInvalidate.add(getRoomIdFromPagingKey(key));
  }
  for (const key of pagingHasMore.keys()) {
    roomsToInvalidate.add(getRoomIdFromPagingKey(key));
  }

  cache.clear();
  snapshotInflight.clear();
  snapshotHasMore.clear();
  pagingInflight.clear();
  pagingHasMore.clear();
  for (const room of roomsToInvalidate) {
    bumpCacheGeneration(room);
  }
}

export function applyOptimisticToCache(roomId: RoomId, chat: Chat): void {
  const roomCache = getCachedChatLogs(roomId);
  if (!roomCache) return;

  setCachedChatLogs(roomId, [chat, ...roomCache.data], roomCache.hasMore);
}

export function replaceOptimisticInCache(optimisticUuid: string, serverChat: Chat): void {
  const roomId = serverChat.room_id ?? DEFAULT_ROOM_ID;
  const roomCache = getCachedChatLogs(roomId);
  if (!roomCache) return;

  const index = roomCache.data.findIndex((chat) => chat.uuid === optimisticUuid && chat.optimistic);
  if (index === -1) return;

  const next = [...roomCache.data];
  next[index] = serverChat;
  setCachedChatLogs(roomId, next, roomCache.hasMore);
}

export function getCacheInfo(roomId: RoomId = DEFAULT_ROOM_ID): { cached: boolean; age?: number } {
  const roomCache = getCachedChatLogs(roomId);
  if (!roomCache) {
    return { cached: false };
  }

  return {
    cached: true,
    age: Date.now() - roomCache.timestamp,
  };
}

export function getPagingHasMore(
  roomId: RoomId,
  offset: number,
  limit: number
): boolean | undefined {
  return pagingHasMore.get(getPagingKey(roomId, offset, limit));
}

/**
 * canonical snapshot (offset=0) に追加で続きが存在するかどうか。
 * 未取得 / オフラインフォールバック中は undefined を返す。
 */
export function getSnapshotHasMore(roomId: RoomId): boolean | undefined {
  return snapshotHasMore.get(roomId);
}

export const chatLogResource = {
  loadChatLogs,
  loadChatLogsSnapshot,
  loadChatLogsWithPaging,
  loadInitialChatLogs,
  prefetchChatLogs,
  invalidateCache,
  applyOptimisticToCache,
  getCacheInfo,
  getPagingHasMore,
  getSnapshotHasMore,
};
