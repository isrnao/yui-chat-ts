import type { Chat } from '@features/chat/types';
import { supabase } from '@shared/supabaseClient';
import { mockChatData, isOnline } from '@features/chat/utils/fallback';
import { normalizeChat } from '../utils/normalizeMetadata';
import { DEFAULT_ROOM_ID, type RoomId } from '../rooms';

const TABLE = 'chats';
const SELECT_COLUMNS = 'uuid,room_id,name,color,message,time,system,email,ip,ua,metadata';
const MAX_CHAT_LOG = 100;
const CACHE_DURATION = 5 * 60 * 1000;

interface CacheEntry {
  data: Chat[];
  timestamp: number;
}

const cache = new Map<RoomId, CacheEntry>();
const snapshotInflight = new Map<RoomId, Promise<Chat[]>>();
const pagingInflight = new Map<string, Promise<Chat[]>>();
const pagingHasMore = new Map<string, boolean>();
const cacheGeneration = new Map<RoomId, number>();

let perfStartTime = 0;

function startPerf(): void {
  perfStartTime = performance.now();
}

function endPerf(operation: string): void {
  const duration = performance.now() - perfStartTime;
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

function setCachedChatLogs(roomId: RoomId, data: Chat[]): void {
  cache.set(roomId, {
    data,
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

async function fetchSnapshot(roomId: RoomId, generation: number): Promise<Chat[]> {
  return retryApiCall(async () => {
    if (!isOnline()) {
      endPerf('loadChatLogs-offline');
      return getOfflineChatData(roomId);
    }

    const { data, error } = await supabase
      .from(TABLE)
      .select(SELECT_COLUMNS)
      .eq('room_id', roomId)
      .eq('deleted', false)
      .order('uuid', { ascending: false })
      .limit(MAX_CHAT_LOG);

    if (error) {
      if (error.code === '401' || error.message.includes('JWT')) {
        return getOfflineChatData(roomId);
      }

      throw new Error(`Supabase error: ${error.message} (${error.code})`);
    }

    const chatData = (data ?? []).map(normalizeChat);
    if (getCacheGeneration(roomId) === generation) {
      setCachedChatLogs(roomId, chatData);
    }
    endPerf('loadChatLogs-network');

    return chatData;
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

export async function loadChatLogs(
  roomId: RoomId = DEFAULT_ROOM_ID,
  useCache = true
): Promise<Chat[]> {
  startPerf();

  const cached = getCachedChatLogs(roomId);
  if (useCache && cached && isFreshCache(cached)) {
    endPerf('loadChatLogs-cache');
    return cached.data;
  }

  const inflight = snapshotInflight.get(roomId);
  if (inflight) {
    return inflight;
  }

  const generation = getCacheGeneration(roomId);
  let request: Promise<Chat[]>;
  request = fetchSnapshot(roomId, generation).finally(() => {
    if (snapshotInflight.get(roomId) === request) {
      snapshotInflight.delete(roomId);
    }
  });
  snapshotInflight.set(roomId, request);
  return request;
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
    const snapshot = await loadChatLogs(roomId, useCache);
    return snapshot.slice(0, limit);
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
    await loadChatLogs(roomId);
  } catch {
    // Best-effort prefetch only.
  }
}

export function invalidateCache(roomId?: RoomId): void {
  if (roomId) {
    cache.delete(roomId);
    snapshotInflight.delete(roomId);
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
  pagingInflight.clear();
  pagingHasMore.clear();
  for (const room of roomsToInvalidate) {
    bumpCacheGeneration(room);
  }
}

export function applyOptimisticToCache(roomId: RoomId, chat: Chat): void {
  const roomCache = getCachedChatLogs(roomId);
  if (!roomCache) return;

  setCachedChatLogs(roomId, [chat, ...roomCache.data]);
}

export function replaceOptimisticInCache(optimisticUuid: string, serverChat: Chat): void {
  const roomId = serverChat.room_id ?? DEFAULT_ROOM_ID;
  const roomCache = getCachedChatLogs(roomId);
  if (!roomCache) return;

  const index = roomCache.data.findIndex((chat) => chat.uuid === optimisticUuid && chat.optimistic);
  if (index === -1) return;

  const next = [...roomCache.data];
  next[index] = serverChat;
  setCachedChatLogs(roomId, next);
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

export const chatLogResource = {
  loadChatLogs,
  loadChatLogsWithPaging,
  loadInitialChatLogs,
  prefetchChatLogs,
  invalidateCache,
  applyOptimisticToCache,
  getCacheInfo,
  getPagingHasMore,
};
