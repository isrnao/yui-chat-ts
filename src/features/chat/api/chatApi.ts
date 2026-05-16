import type { Chat } from '@features/chat/types';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@shared/supabaseClient';
import { mockChatData, isOnline } from '@features/chat/utils/fallback';
import { generateUUIDv7FromTimestamp } from '@shared/utils/uuid';
import { normalizeChat } from '../utils/normalizeMetadata';
import { DEFAULT_ROOM_ID, type RoomId } from '../rooms';
import {
  loadChatLogs as resourceLoadChatLogs,
  loadChatLogsWithPaging as resourceLoadChatLogsWithPaging,
  loadInitialChatLogs as resourceLoadInitialChatLogs,
  invalidateCache as resourceInvalidateCache,
  applyOptimisticToCache,
  replaceOptimisticInCache,
  getCacheInfo as resourceGetCacheInfo,
  getPagingHasMore,
  getSnapshotHasMore,
} from './chatLogResource';
export { prefetchChatLogs } from './chatLogResource';

const TABLE = 'chats';

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

function getOfflineChatData(roomId: RoomId): Chat[] {
  return mockChatData.map((chat) => ({ ...chat, room_id: roomId }));
}

export async function loadChatLogs(
  roomId: RoomId = DEFAULT_ROOM_ID,
  useCache = true
): Promise<Chat[]> {
  return resourceLoadChatLogs(roomId, useCache);
}

// 増分読み込み用関数を追加
export async function loadChatLogsWithPaging(
  roomId: RoomId = DEFAULT_ROOM_ID,
  limit = 50,
  offset = 0,
  useCache = true
): Promise<{ data: Chat[]; hasMore: boolean }> {
  if (offset === 0) {
    const snapshot = await resourceLoadChatLogs(roomId, useCache);
    // hasMore は次の 2 条件のいずれかで真:
    //   (1) 要求 limit より snapshot が長い → snapshot 内に未表示分がある
    //   (2) snapshot 自体が canonical cap (MAX_CHAT_LOG) に張り付いており、
    //       テーブルにさらに続きが存在することが分かっている
    const snapshotHasMoreFlag = getSnapshotHasMore(roomId) ?? false;
    return {
      data: snapshot.slice(0, limit),
      hasMore: snapshot.length > limit || snapshotHasMoreFlag,
    };
  }

  const data = await resourceLoadChatLogsWithPaging(roomId, offset, limit, useCache);
  const exactHasMore = getPagingHasMore(roomId, offset, limit);
  return {
    data,
    hasMore: exactHasMore ?? data.length >= limit,
  };
}

// 初回読み込み時の最適化された関数
export async function loadInitialChatLogs(
  roomId: RoomId = DEFAULT_ROOM_ID,
  limit = 100
): Promise<Chat[]> {
  return resourceLoadInitialChatLogs(roomId, limit, true);
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
  // 論理削除に統一: SELECT 側は .eq('deleted', false) でフィルタしているため、
  // hard delete ではなく deleted フラグを立てることで clearChatLogsByName と整合する。
  const { error } = await supabase
    .from(TABLE)
    .update({ deleted: true })
    .eq('room_id', roomId)
    .eq('deleted', false);
  if (error) {
    throw new Error(`Failed to clear chat logs: ${error.message}`);
  }
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
  resourceInvalidateCache(roomId);
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
// 楽観的更新中の time は「サーバー時刻より十分先」に置き、ChatLogList の
// time-desc フォールバック sort で常に先頭に来ることを保証する。
// savedChat にマージされた時点でサーバー側の正しい time に置換される。
const OPTIMISTIC_TIME_OFFSET_MS = 365 * 24 * 60 * 60 * 1000;

export function createOptimisticChat(chatData: Omit<Chat, 'uuid' | 'time' | 'optimistic'>): Chat {
  // optimisticNonce: 楽観的更新の重複表示防止用のランダム識別子。
  // saveChatLogOptimistic がそのまま metadata に詰めて保存し、
  // realtime INSERT で同じ nonce が echo されるため、temp UUID と savedChat の
  // 同一性判定 (reduceOptimisticChat) を (client_time + name + message) より厳密に行える。
  const nonce =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const now = Date.now();
  const baseMetadata = chatData.metadata ?? { version: 1 as const };
  return {
    ...chatData,
    uuid: `temp-${now}-${Math.random().toString(36).substr(2, 9)}`, // 一時UUID
    time: now + OPTIMISTIC_TIME_OFFSET_MS, // 先頭表示保証用の未来時刻
    client_time: now,
    optimistic: true,
    metadata: { ...baseMetadata, optimisticNonce: nonce },
  };
}

// キャッシュに楽観的チャットを追加
export function addOptimisticChatToCache(chat: Chat): void {
  const roomId = chat.room_id ?? DEFAULT_ROOM_ID;
  applyOptimisticToCache(roomId, chat);
}

// 楽観的チャットをサーバーからの結果で置換
export function replaceOptimisticChatInCache(optimisticUuid: string, serverChat: Chat): void {
  replaceOptimisticInCache(optimisticUuid, serverChat);
}

// キャッシュ状態確認関数
export function getCacheInfo(roomId: RoomId = DEFAULT_ROOM_ID): { cached: boolean; age?: number } {
  return resourceGetCacheInfo(roomId);
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
//
// room 単位で 1 channel を共有し、refCount で生死を管理する設計。
// 同 room に対する複数 subscribe (StrictMode の二重 mount 含む) を
// 同一 channel 上の listener Set に集約することで、
// `chats-postgres-${roomId}` 等の channel 名衝突と leak を回避する。

export type LookEvent = { type: 'look'; messageId: string } | { type: 'unlook' };

type PostgresListener = (chat: Chat) => void;
type LookListener = (event: LookEvent) => void;

// Postgres Changes (INSERT) の購読 registry
type PostgresEntry = {
  channel: RealtimeChannel;
  listeners: Set<PostgresListener>;
};
const postgresEntries = new Map<RoomId, PostgresEntry>();

// Broadcast (look/unlook) の購読 registry
type BroadcastEntry = {
  channel: RealtimeChannel;
  listeners: Set<LookListener>;
};
const broadcastEntries = new Map<RoomId, BroadcastEntry>();

function createPostgresEntry(roomId: RoomId): PostgresEntry {
  const listeners = new Set<PostgresListener>();
  const channel = supabase
    .channel(`chats-postgres-${roomId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: TABLE, filter: `room_id=eq.${roomId}` },
      (payload) => {
        const chat = normalizeChat(payload.new);
        for (const listener of listeners) listener(chat);
      }
    )
    .subscribe();
  return { channel, listeners };
}

function createBroadcastEntry(roomId: RoomId): BroadcastEntry {
  const listeners = new Set<LookListener>();
  const channel = supabase
    .channel(`chats-broadcast-${roomId}`)
    .on('broadcast', { event: 'look' }, (payload) => {
      const event = payload.payload as LookEvent;
      for (const listener of listeners) listener(event);
    })
    .subscribe();
  return { channel, listeners };
}

function getOrCreateBroadcastEntry(roomId: RoomId): BroadcastEntry {
  let entry = broadcastEntries.get(roomId);
  if (!entry) {
    entry = createBroadcastEntry(roomId);
    broadcastEntries.set(roomId, entry);
  }
  return entry;
}

/**
 * Postgres Changes 用の購読を登録する。
 * 同 room の複数購読者は同一 channel を共有し、最後の解除で channel が破棄される。
 */
export function subscribeChatLogs(
  roomId: RoomId,
  callback: PostgresListener
): { unsubscribe: () => void } {
  let entry = postgresEntries.get(roomId);
  if (!entry) {
    entry = createPostgresEntry(roomId);
    postgresEntries.set(roomId, entry);
  }
  entry.listeners.add(callback);

  return {
    unsubscribe() {
      const current = postgresEntries.get(roomId);
      if (!current) return;
      current.listeners.delete(callback);
      if (current.listeners.size === 0) {
        supabase.removeChannel(current.channel);
        postgresEntries.delete(roomId);
      }
    },
  };
}

// --- Broadcast: look/unlook イベント ---

// send-only 利用 (listener 0) で起こした channel は send 後に明示破棄する。
// onLookBroadcast 経路で listener が既に存在する場合は通常の refCount cleanup に任せる。
function sendBroadcastLookPayload(roomId: RoomId, payload: LookEvent): void {
  const hadListeners = (broadcastEntries.get(roomId)?.listeners.size ?? 0) > 0;
  const entry = getOrCreateBroadcastEntry(roomId);
  // channel.send は Promise を返す。listener が居なかった場合は送信完了後に
  // (= 他に listener が追加されていないことを確認したうえで) channel を破棄する。
  void Promise.resolve(
    entry.channel.send({ type: 'broadcast', event: 'look', payload })
  ).finally(() => {
    if (hadListeners) return;
    const current = broadcastEntries.get(roomId);
    if (!current) return;
    if (current.listeners.size > 0) return; // 送信中に listener が登録されていたら維持
    supabase.removeChannel(current.channel);
    broadcastEntries.delete(roomId);
  });
}

export function broadcastLookEvent(roomId: RoomId, messageId: string): void {
  sendBroadcastLookPayload(roomId, { type: 'look', messageId });
}

export function broadcastUnlookEvent(roomId: RoomId): void {
  sendBroadcastLookPayload(roomId, { type: 'unlook' });
}

export function onLookBroadcast(roomId: RoomId, callback: LookListener): () => void {
  const entry = getOrCreateBroadcastEntry(roomId);
  entry.listeners.add(callback);
  return () => {
    const current = broadcastEntries.get(roomId);
    if (!current) return;
    current.listeners.delete(callback);
    if (current.listeners.size === 0) {
      supabase.removeChannel(current.channel);
      broadcastEntries.delete(roomId);
    }
  };
}
