import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { Chat } from '../chat/types';
import {
  createMockChatData,
  type ConnectivityAdapter,
  type ConnectivityListener,
  createStaticConnectivityAdapter,
} from '../utils/fallback';
import { generateUUIDv7FromTimestamp } from '../utils/uuid';

export type CacheItem = {
  data: Chat[];
  timestamp: number;
};

export interface ChatCacheStorage {
  read(): Promise<CacheItem | null> | CacheItem | null;
  write(cache: CacheItem): Promise<void> | void;
  clear(): Promise<void> | void;
}

export type RetryConfig = {
  attempts?: number;
  delayMs?: number;
};

export interface ChatApiConfig {
  supabase: SupabaseClient;
  table?: string;
  cacheTtlMs?: number;
  maxRows?: number;
  now?: () => number;
  fallbackChats?: () => Chat[];
  connectivity?: ConnectivityAdapter;
  cacheStorage?: ChatCacheStorage;
  retry?: RetryConfig;
  logger?: Pick<Console, 'warn' | 'error'>;
}

export interface ChatApi {
  loadChatLogs(useCache?: boolean): Promise<Chat[]>;
  loadChatLogsWithPaging(
    limit?: number,
    offset?: number,
    useCache?: boolean,
  ): Promise<{ data: Chat[]; hasMore: boolean }>;
  loadInitialChatLogs(limit?: number): Promise<Chat[]>;
  loadChatLogsByTimeRange(startTime: number, endTime?: number, limit?: number): Promise<Chat[]>;
  saveChatLog(chat: Chat): Promise<Chat>;
  saveChatLogOptimistic(chat: Chat): Promise<Chat>;
  saveChatLogFireAndForget(chat: Chat): Promise<void>;
  clearChatLogs(): Promise<void>;
  invalidateCache(): Promise<void>;
  getCacheInfo(): Promise<{ cached: boolean; age?: number }>;
  subscribeChatLogs(callback: (chat: Chat) => void): RealtimeChannel;
  createOptimisticChat(chat: Omit<Chat, 'uuid' | 'time' | 'optimistic'>): Chat;
  addOptimisticChatToCache(chat: Chat): Promise<void>;
  replaceOptimisticChatInCache(optimisticUuid: string, serverChat: Chat): Promise<void>;
  isOnline(): boolean;
  onConnectivityChange?(listener: ConnectivityListener): () => void;
}

const DEFAULT_MAX_ROWS = 100;
const DEFAULT_CACHE_TTL = 5 * 60 * 1000;
const DEFAULT_TABLE = 'chats';
const DEFAULT_RETRY: Required<RetryConfig> = { attempts: 3, delayMs: 1_000 };

export function createChatApi(config: ChatApiConfig): ChatApi {
  const {
    supabase,
    table = DEFAULT_TABLE,
    cacheTtlMs = DEFAULT_CACHE_TTL,
    maxRows = DEFAULT_MAX_ROWS,
    now = () => Date.now(),
    fallbackChats = () => createMockChatData({ now }),
    connectivity = createStaticConnectivityAdapter(true),
    cacheStorage,
    retry = {},
    logger = console,
  } = config;

  let memoryCache: CacheItem | null = null;

  const resolvedRetry: Required<RetryConfig> = {
    attempts: retry.attempts ?? DEFAULT_RETRY.attempts,
    delayMs: retry.delayMs ?? DEFAULT_RETRY.delayMs,
  };

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= resolvedRetry.attempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === resolvedRetry.attempts) {
          throw error;
        }
        await sleep(resolvedRetry.delayMs * 2 ** (attempt - 1));
      }
    }
    throw new Error('Retry attempts exhausted');
  }

  async function readCache(): Promise<CacheItem | null> {
    if (memoryCache) {
      return memoryCache;
    }
    if (cacheStorage) {
      const cached = await cacheStorage.read();
      if (cached) {
        memoryCache = cached;
        return cached;
      }
    }
    return null;
  }

  async function writeCache(data: Chat[]): Promise<void> {
    const cache: CacheItem = { data, timestamp: now() };
    memoryCache = cache;
    if (cacheStorage) {
      await cacheStorage.write(cache);
    }
  }

  async function clearCache(): Promise<void> {
    memoryCache = null;
    if (cacheStorage) {
      await cacheStorage.clear();
    }
  }

  async function ensureCache(): Promise<CacheItem | null> {
    const cache = await readCache();
    if (!cache) return null;
    const age = now() - cache.timestamp;
    if (age > cacheTtlMs) {
      return null;
    }
    return cache;
  }

  async function loadChatLogs(useCache = true): Promise<Chat[]> {
    if (!connectivity.isOnline()) {
      const cache = await readCache();
      if (cache) {
        return cache.data;
      }
      const fallback = fallbackChats();
      await writeCache(fallback);
      return fallback;
    }

    if (useCache) {
      const cache = await ensureCache();
      if (cache) {
        return cache.data;
      }
    }

    const data = await withRetry(async () => {
      const { data: rows, error } = await supabase
        .from(table)
        .select('uuid,name,color,message,time,system,email,ip,ua,optimistic,client_time')
        .order('uuid', { ascending: false })
        .limit(maxRows);

      if (error) {
        throw new Error(`Supabase error: ${error.message} (${error.code})`);
      }

      return (rows as Chat[]) ?? [];
    });

    await writeCache(data);
    return data;
  }

  async function loadChatLogsWithPaging(
    limit = 50,
    offset = 0,
    useCache = true,
  ): Promise<{ data: Chat[]; hasMore: boolean }> {
    if (!connectivity.isOnline()) {
      const cache = await readCache();
      if (cache) {
        const slice = cache.data.slice(offset, offset + limit);
        return { data: slice, hasMore: cache.data.length > offset + limit };
      }
      const fallback = fallbackChats();
      await writeCache(fallback);
      return {
        data: fallback.slice(offset, offset + limit),
        hasMore: fallback.length > offset + limit,
      };
    }

    if (offset === 0 && useCache) {
      const cache = await ensureCache();
      if (cache) {
        return {
          data: cache.data.slice(0, limit),
          hasMore: cache.data.length > limit,
        };
      }
    }

    const result = await withRetry(async () => {
      const { data: rows, count, error } = await supabase
        .from(table)
        .select('uuid,name,color,message,time,system,email,ip,ua,optimistic,client_time', {
          count: 'exact',
        })
        .order('uuid', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new Error(`Supabase pagination error: ${error.message} (${error.code})`);
      }

      return {
        data: ((rows ?? []) as Chat[]) ?? [],
        count: count ?? 0,
      };
    });

    if (offset === 0) {
      await writeCache(result.data);
    }

    return {
      data: result.data,
      hasMore: result.count > offset + limit,
    };
  }

  async function loadInitialChatLogs(limit = maxRows): Promise<Chat[]> {
    const { data } = await loadChatLogsWithPaging(limit, 0, true);
    return data;
  }

  async function saveChatLogOptimistic(chat: Chat): Promise<Chat> {
    const sanitized = sanitizeChat(chat);
    return withRetry(async () => {
      const { data, error } = await supabase
        .from(table)
        .insert(sanitized)
        .select('uuid,time')
        .single();

      if (error) {
        throw new Error(`Failed to save chat: ${error.message}`);
      }

      const serverChat = {
        ...chat,
        uuid: (data as any).uuid,
        time: (data as any).time,
        optimistic: false,
      } as Chat;

      await clearCache();

      return serverChat;
    });
  }

  async function saveChatLog(chat: Chat): Promise<Chat> {
    const sanitized = sanitizeChat(chat);
    return withRetry(async () => {
      const { data, error } = await supabase
        .from(table)
        .insert(sanitized)
        .select('uuid,name,color,message,time,system,email,ip,ua')
        .single();

      if (error) {
        throw new Error(`Failed to save chat: ${error.message}`);
      }

      await clearCache();

      return data as Chat;
    });
  }

  async function saveChatLogFireAndForget(chat: Chat): Promise<void> {
    const sanitized = sanitizeChat(chat);
    void (async () => {
      try {
        await supabase.from(table).insert(sanitized);
        await clearCache();
      } catch (error) {
        logger.warn?.('Background chat save failed', error);
      }
    })();
  }

  async function clearChatLogs(): Promise<void> {
    await supabase.from(table).delete().neq('uuid', '');
    await clearCache();
  }

  async function invalidateCache(): Promise<void> {
    await clearCache();
  }

  async function getCacheInfo(): Promise<{ cached: boolean; age?: number }> {
    const cache = await readCache();
    if (!cache) {
      return { cached: false };
    }
    return { cached: true, age: now() - cache.timestamp };
  }

  function subscribeChatLogs(callback: (chat: Chat) => void): RealtimeChannel {
    return supabase
      .channel(table)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table }, (payload) => {
        callback(payload.new as Chat);
      })
      .subscribe();
  }

  function createOptimisticChat(chat: Omit<Chat, 'uuid' | 'time' | 'optimistic'>): Chat {
    return {
      ...chat,
      uuid: `temp-${now()}-${Math.random().toString(36).slice(2, 11)}`,
      time: now(),
      client_time: now(),
      optimistic: true,
    };
  }

  async function addOptimisticChatToCache(chat: Chat): Promise<void> {
    const cache = (await readCache()) ?? { data: [], timestamp: now() };
    cache.data = [chat, ...cache.data];
    cache.timestamp = now();
    memoryCache = cache;
    if (cacheStorage) {
      await cacheStorage.write(cache);
    }
  }

  async function replaceOptimisticChatInCache(optimisticUuid: string, serverChat: Chat): Promise<void> {
    const cache = await readCache();
    if (!cache) return;
    const index = cache.data.findIndex((chat) => chat.uuid === optimisticUuid && chat.optimistic);
    if (index === -1) return;
    cache.data[index] = serverChat;
    cache.timestamp = now();
    memoryCache = cache;
    if (cacheStorage) {
      await cacheStorage.write(cache);
    }
  }

  async function loadChatLogsByTimeRange(
    startTime: number,
    endTime?: number,
    limit = maxRows,
  ): Promise<Chat[]> {
    if (!connectivity.isOnline()) {
      const cache = await readCache();
      if (cache) {
        const end = endTime ?? now();
        return cache.data
          .filter((chat) => chat.time >= startTime && chat.time <= end)
          .slice(0, limit);
      }
      return fallbackChats();
    }

    return withRetry(async () => {
      const startUUID = generateUUIDv7FromTimestamp(startTime);
      const endUUID = endTime ? generateUUIDv7FromTimestamp(endTime) : undefined;

      let query = supabase
        .from(table)
        .select('uuid,name,color,message,time,system,email,ip,ua')
        .gte('uuid', startUUID)
        .order('uuid', { ascending: false })
        .limit(limit);

      if (endUUID) {
        query = query.lte('uuid', endUUID);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Supabase time range query error: ${error.message} (${error.code})`);
      }

      return (data as Chat[]) ?? [];
    });
  }

  return {
    loadChatLogs,
    loadChatLogsWithPaging,
    loadInitialChatLogs,
    loadChatLogsByTimeRange,
    saveChatLog,
    saveChatLogOptimistic,
    saveChatLogFireAndForget,
    clearChatLogs,
    invalidateCache,
    getCacheInfo,
    subscribeChatLogs,
    createOptimisticChat,
    addOptimisticChatToCache,
    replaceOptimisticChatInCache,
    isOnline: () => connectivity.isOnline(),
    onConnectivityChange: connectivity.subscribe
      ? (listener: ConnectivityListener) => connectivity.subscribe!(listener)
      : undefined,
  };
}

function sanitizeChat(chat: Chat) {
  const {
    uuid: _uuid,
    time: _time,
    optimistic: _optimistic,
    client_time: _clientTime,
    ...rest
  } = chat;
  return rest;
}
