import type { Chat } from '@features/chat/types';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@shared/supabaseClient';
import { mockChatData, isOnline } from '@features/chat/utils/fallback';
import { generateUUIDv7FromTimestamp } from '@shared/utils/uuid';
import { normalizeChat } from '../utils/normalizeMetadata';
import { DEFAULT_ROOM_ID, type RoomId } from '../rooms';

const TABLE = 'chats';
const MAX_CHAT_LOG = 100;
const CACHE_DURATION = 5 * 60 * 1000; // 5分

// UUID v7最適化設定
// Supabase側でUUID v7を主キーとして自動生成し、時系列順序性を活用

// 軽量パフォーマンス追跡
let perfStartTime = 0;
function startPerf() {
  perfStartTime = performance.now();
}

function endPerf(operation: string) {
  const duration = performance.now() - perfStartTime;
  // 本番環境でも重大なパフォーマンス問題は警告
  if (duration > 3000) {
    console.warn(`Performance issue in ${operation}: ${duration.toFixed(0)}ms`);
  }
}

// 簡易インメモリキャッシュ
interface CacheItem {
  data: Chat[];
  timestamp: number;
}

const chatLogsCache = new Map<RoomId, CacheItem>();

// パフォーマンス測定用のヘルパー関数（開発環境のみ）
async function measureApiCall<T>(apiCall: () => Promise<T>): Promise<T> {
  return await apiCall();
}

// リトライ機能付きのAPI呼び出し
async function retryApiCall<T>(
  apiCall: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await measureApiCall(apiCall);
    } catch (error: any) {
      if (attempt === maxRetries) {
        throw error;
      }

      // 指数バックオフで待機
      const waitTime = delay * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
  throw new Error('Max retries exceeded');
}

function getCachedChatLogs(roomId: RoomId): CacheItem | null {
  return chatLogsCache.get(roomId) ?? null;
}

function setCachedChatLogs(roomId: RoomId, data: Chat[]): void {
  chatLogsCache.set(roomId, {
    data,
    timestamp: Date.now(),
  });
}

function getOfflineChatData(roomId: RoomId): Chat[] {
  return mockChatData.map((chat) => ({ ...chat, room_id: roomId }));
}

export async function loadChatLogs(
  roomId: RoomId = DEFAULT_ROOM_ID,
  useCache = true
): Promise<Chat[]> {
  startPerf();

  return retryApiCall(async () => {
    // オフライン時はモックデータを返す
    if (!isOnline()) {
      endPerf('loadChatLogs-offline');
      return getOfflineChatData(roomId);
    }

    // キャッシュチェック
    const roomCache = getCachedChatLogs(roomId);
    if (useCache && roomCache) {
      const now = Date.now();
      if (now - roomCache.timestamp < CACHE_DURATION) {
        endPerf('loadChatLogs-cache');
        return roomCache.data;
      }
    }

    // 必要な列のみ選択して、サーバー側でのデータ転送量を削減
    // UUID v7の主キーを活用して高速ソート
    const { data, error } = await supabase
      .from(TABLE)
      .select('uuid,room_id,name,color,message,time,system,email,ip,ua,metadata')
      .eq('room_id', roomId)
      .eq('deleted', false)
      .order('uuid', { ascending: false }) // UUID v7の時系列順序性を活用
      .limit(MAX_CHAT_LOG);

    if (error) {
      // 401 Unauthorized の場合はモックデータで代替
      if (error.code === '401' || error.message.includes('JWT')) {
        return getOfflineChatData(roomId);
      }

      throw new Error(`Supabase error: ${error.message} (${error.code})`);
    }

    if (!data) {
      return [];
    }

    const chatData = (data ?? []).map(normalizeChat);

    // キャッシュに保存
    setCachedChatLogs(roomId, chatData);

    endPerf('loadChatLogs-network');

    return chatData;
  });
}

// 増分読み込み用関数を追加
export async function loadChatLogsWithPaging(
  roomId: RoomId = DEFAULT_ROOM_ID,
  limit = 50,
  offset = 0,
  useCache = true
): Promise<{ data: Chat[]; hasMore: boolean }> {
  return retryApiCall(async () => {
    // 初回読み込み時はキャッシュから返す
    const roomCache = getCachedChatLogs(roomId);
    if (offset === 0 && useCache && roomCache) {
      const now = Date.now();
      if (now - roomCache.timestamp < CACHE_DURATION) {
        return {
          data: roomCache.data.slice(0, limit),
          hasMore: roomCache.data.length > limit,
        };
      }
    }

    const { data, count, error } = await supabase
      .from(TABLE)
      .select('uuid,room_id,name,color,message,time,system,email,ip,ua,metadata', {
        count: 'exact',
      })
      .eq('room_id', roomId)
      .eq('deleted', false)
      .order('uuid', { ascending: false }) // UUID v7の時系列順序性を活用
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Supabase pagination error: ${error.message} (${error.code})`);
    }

    const chatData = (data ?? []).map(normalizeChat);

    // 初回読み込み時はキャッシュに保存
    if (offset === 0) {
      setCachedChatLogs(roomId, chatData);
    }

    return {
      data: chatData,
      hasMore: (count || 0) > offset + limit,
    };
  });
}

// 初回読み込み時の最適化された関数
export async function loadInitialChatLogs(
  roomId: RoomId = DEFAULT_ROOM_ID,
  limit = 100
): Promise<Chat[]> {
  const result = await loadChatLogsWithPaging(roomId, limit, 0, true);
  return result.data;
}

// 楽観的更新用の高速バージョン
export async function saveChatLogOptimistic(
  roomId: RoomId = DEFAULT_ROOM_ID,
  chat: Chat
): Promise<Chat> {
  startPerf();

  return retryApiCall(async () => {
    const sanitized = {
      // idは除外 - Supabaseでサーバー側のUUID v7を生成
      room_id: roomId,
      name: chat.name,
      color: chat.color,
      message: chat.message,
      // timeは除外 - Supabaseでサーバー側のタイムスタンプを使用
      system: chat.system,
      email: chat.email,
      ip: chat.ip,
      ua: chat.ua,
      metadata: chat.metadata ?? null,
    };

    // selectを最小限に（uuidとtimeのみ）してパフォーマンス向上
    const { data, error } = await supabase
      .from(TABLE)
      .insert(sanitized)
      .select('uuid,room_id,time')
      .single();

    if (error) {
      throw new Error(`Failed to save chat: ${error.message}`);
    }

    // キャッシュ無効化を非同期で実行（ブロッキングしない）
    Promise.resolve().then(() => invalidateCache(roomId));

    endPerf('saveChatLogOptimistic');

    // サーバー側のUUID v7とタイムスタンプを使用して完全なChatオブジェクトを返す
    return {
      ...chat,
      uuid: (data as any).uuid, // サーバー生成のUUID v7
      room_id: (data as any).room_id ?? roomId,
      time: (data as any).time,
      optimistic: false,
    };
  });
}

// 従来の互換性維持版
export async function saveChatLog(roomId: RoomId = DEFAULT_ROOM_ID, chat: Chat): Promise<Chat> {
  startPerf();

  return retryApiCall(async () => {
    const sanitized = {
      // idは除外 - Supabaseでサーバー側のUUID v7を生成
      room_id: roomId,
      name: chat.name,
      color: chat.color,
      message: chat.message,
      // timeは除外 - Supabaseでサーバー側のタイムスタンプを使用
      system: chat.system,
      email: chat.email,
      ip: chat.ip,
      ua: chat.ua,
      metadata: chat.metadata ?? null,
    };

    // insertして、必要な列のみを取得（パフォーマンス向上）
    const { data, error } = await supabase
      .from(TABLE)
      .insert(sanitized)
      .select('uuid,room_id,name,color,message,time,system,email,ip,ua,metadata')
      .single();

    if (error) {
      throw new Error(`Failed to save chat: ${error.message}`);
    }

    // 新しいチャットが追加されたらキャッシュを無効化
    invalidateCache(roomId);

    endPerf('saveChatLog');

    // サーバー側のタイムスタンプを含むデータを返す
    return data as Chat;
  });
}

// Fire-and-forget版（レスポンスを待たない最高速版）
export function saveChatLogFireAndForget(chat: Chat): Promise<void> {
  const sanitized = {
    // idは除外 - Supabaseでサーバー側のUUID v7を生成
    room_id: chat.room_id ?? DEFAULT_ROOM_ID,
    name: chat.name,
    color: chat.color,
    message: chat.message,
    system: chat.system,
    email: chat.email,
    ip: chat.ip,
    ua: chat.ua,
    metadata: chat.metadata ?? null,
  };

  // バックグラウンドでの非同期実行
  (async () => {
    try {
      await supabase.from(TABLE).insert(sanitized);

      // 成功時のみキャッシュを無効化
      invalidateCache(chat.room_id ?? DEFAULT_ROOM_ID);
    } catch (error) {
      console.error('Background chat save failed:', error);
    }
  })();

  // 即座に解決
  return Promise.resolve();
}

export async function clearChatLogs(roomId: RoomId = DEFAULT_ROOM_ID): Promise<void> {
  await supabase.from(TABLE).delete().eq('room_id', roomId).neq('uuid', '');

  // チャットログがクリアされたらキャッシュを無効化
  invalidateCache(roomId);
}

// 指定したハンドルネームの発言に削除フラグを立てる（論理削除）
export async function clearChatLogsByName(
  roomId: RoomId = DEFAULT_ROOM_ID,
  name: string
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .update({ deleted: true })
    .eq('room_id', roomId)
    .eq('name', name);
  if (error) {
    throw new Error(`Failed to clear chat logs: ${error.message}`);
  }
  invalidateCache(roomId);
}

// キャッシュ無効化関数（非同期版も追加）
export function invalidateCache(roomId?: RoomId): void {
  if (roomId) {
    chatLogsCache.delete(roomId);
    return;
  }

  chatLogsCache.clear();
}

export async function invalidateCacheAsync(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(() => {
      invalidateCache();
      resolve();
    }, 0);
  });
}

// 楽観的更新用のヘルパー関数
export function createOptimisticChat(chatData: Omit<Chat, 'uuid' | 'time' | 'optimistic'>): Chat {
  return {
    ...chatData,
    uuid: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // 一時UUID
    time: Date.now(), // クライアント側の一時的なタイムスタンプ
    client_time: Date.now(),
    optimistic: true,
  };
}

// キャッシュに楽観的チャットを追加
export function addOptimisticChatToCache(chat: Chat): void {
  const roomId = chat.room_id ?? DEFAULT_ROOM_ID;
  const roomCache = getCachedChatLogs(roomId);
  if (!roomCache) return;

  setCachedChatLogs(roomId, [chat, ...roomCache.data]);
}

// 楽観的チャットをサーバーからの結果で置換
export function replaceOptimisticChatInCache(optimisticUuid: string, serverChat: Chat): void {
  const roomId = serverChat.room_id ?? DEFAULT_ROOM_ID;
  const roomCache = getCachedChatLogs(roomId);
  if (!roomCache) return;

  const index = roomCache.data.findIndex((chat) => chat.uuid === optimisticUuid && chat.optimistic);
  if (index === -1) return;

  const next = [...roomCache.data];
  next[index] = serverChat;
  setCachedChatLogs(roomId, next);
}

// キャッシュ状態確認関数
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

// 時間範囲でのUUID v7最適化検索
export async function loadChatLogsByTimeRange(
  roomId: RoomId = DEFAULT_ROOM_ID,
  startTime: number,
  endTime?: number,
  limit = 100
): Promise<Chat[]> {
  return retryApiCall(async () => {
    // オフライン時はモックデータをフィルタリング
    if (!isOnline()) {
      const end = endTime || Date.now();
      return getOfflineChatData(roomId)
        .filter((chat) => chat.time >= startTime && chat.time <= end)
        .slice(0, limit);
    }

    // UUID v7の範囲検索でパフォーマンス最適化
    const startUUID = generateUUIDv7FromTimestamp(startTime);
    const endUUID = endTime ? generateUUIDv7FromTimestamp(endTime) : undefined;

    let query = supabase
      .from(TABLE)
      .select('uuid,room_id,name,color,message,time,system,email,ip,ua,metadata')
      .eq('room_id', roomId)
      .eq('deleted', false)
      .gte('uuid', startUUID) // UUID v7による効率的な範囲検索
      .order('uuid', { ascending: false })
      .limit(limit);

    if (endUUID) {
      query = query.lte('uuid', endUUID);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Supabase time range query error: ${error.message} (${error.code})`);
    }

    return (data ?? []).map(normalizeChat);
  });
}

// --- Realtime チャネル管理 ---

// Broadcast 用の共有チャネル
const broadcastChannels: Partial<Record<RoomId, RealtimeChannel>> = {};
const broadcastSubscribed = new Set<RoomId>();

// look イベントのコールバック集合（StrictMode の二重登録に強い設計）
const lookCallbacks = new Map<RoomId, Set<(event: LookEvent) => void>>();
const lookListenersAttached = new Set<RoomId>();

function getOrCreateLookCallbacks(roomId: RoomId): Set<(event: LookEvent) => void> {
  if (!lookCallbacks.has(roomId)) {
    lookCallbacks.set(roomId, new Set());
  }
  return lookCallbacks.get(roomId)!;
}

function getOrCreateBroadcastChannel(roomId: RoomId): RealtimeChannel {
  if (!broadcastChannels[roomId]) {
    broadcastChannels[roomId] = supabase.channel(`chats-broadcast-${roomId}`);
  }
  return broadcastChannels[roomId]!;
}

function ensureBroadcastSubscribed(roomId: RoomId): void {
  if (!broadcastSubscribed.has(roomId)) {
    getOrCreateBroadcastChannel(roomId).subscribe();
    broadcastSubscribed.add(roomId);
  }
}

function ensureLookListenerAttached(roomId: RoomId): void {
  if (lookListenersAttached.has(roomId)) return;
  const channel = getOrCreateBroadcastChannel(roomId);
  channel.on('broadcast', { event: 'look' }, (payload) => {
    const event = payload.payload as LookEvent;
    // 登録されているすべてのコールバックに dispatch
    for (const cb of getOrCreateLookCallbacks(roomId)) cb(event);
  });
  lookListenersAttached.add(roomId);
}

// Postgres Changes 用（subscribeChatLogs 専用チャネル）
export function subscribeChatLogs(roomId: RoomId, callback: (chat: Chat) => void) {
  const channel = supabase
    .channel(`chats-postgres-${roomId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: TABLE, filter: `room_id=eq.${roomId}` },
      (payload) => callback(normalizeChat(payload.new))
    )
    .subscribe();
  return channel;
}

// --- Broadcast: look/unlook イベント ---

export type LookEvent = { type: 'look'; messageId: string } | { type: 'unlook' };

export function broadcastLookEvent(roomId: RoomId, messageId: string): void {
  const channel = getOrCreateBroadcastChannel(roomId);
  ensureBroadcastSubscribed(roomId);
  channel.send({
    type: 'broadcast',
    event: 'look',
    payload: { type: 'look', messageId } satisfies LookEvent,
  });
}

export function broadcastUnlookEvent(roomId: RoomId): void {
  const channel = getOrCreateBroadcastChannel(roomId);
  ensureBroadcastSubscribed(roomId);
  channel.send({
    type: 'broadcast',
    event: 'look',
    payload: { type: 'unlook' } satisfies LookEvent,
  });
}

export function onLookBroadcast(roomId: RoomId, callback: (event: LookEvent) => void): () => void {
  ensureLookListenerAttached(roomId);
  ensureBroadcastSubscribed(roomId);
  const roomCallbacks = getOrCreateLookCallbacks(roomId);
  roomCallbacks.add(callback);
  // コールバック集合からの削除で解除できる（StrictMode の二重登録にも耐える）
  return () => {
    roomCallbacks.delete(callback);
  };
}
