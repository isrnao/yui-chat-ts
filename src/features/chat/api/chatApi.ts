import type { Chat } from '@features/chat/types';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { recordSendChat } from '@shared/observability/newRelic';
import { supabase } from '@shared/supabaseClient';
import { mockChatData, isOnline } from '@features/chat/utils/fallback';
import { generateUUIDv7FromTimestamp } from '@shared/utils/uuid';
import { normalizeChat } from '../utils/normalizeMetadata';
import { DEFAULT_ROOM_ID, type RoomId } from '../rooms';
import {
  aggregateChatRanking,
  compareRankingEntries,
  type RankingEntry,
} from '../utils/chatRanking';
import {
  loadChatLogs as resourceLoadChatLogs,
  loadChatLogsSnapshot as resourceLoadChatLogsSnapshot,
  loadChatLogsWithPaging as resourceLoadChatLogsWithPaging,
  loadInitialChatLogs as resourceLoadInitialChatLogs,
  loadRecentChatLogs as resourceLoadRecentChatLogs,
  invalidateCache as resourceInvalidateCache,
  getCacheInfo as resourceGetCacheInfo,
  getPagingHasMore,
} from './chatLogResource';
export { prefetchChatLogs, getSnapshotHasMore } from './chatLogResource';

const TABLE = 'chats';
/** 部屋ごとの発言ランキングを集計するビュー (supabase/migrations/20260921000000) */
const RANKING_VIEW = 'chat_ranking';

/**
 * 送信操作 1 件の ID と試行番号。リトライの全試行で同じ ID を送り、save-chat のトレースを
 * 操作単位で束ねる（spec observability-new-relic R5.8〜5.9）。試行ごとに trace ID は変わる。
 */
interface SaveOperation {
  id: string;
  attempt: number;
}

// Edge Function 共通呼び出し。ip / ua はサーバー側で設定するため payload に含めない。
async function invokeSaveChat(
  payload: {
    room_id: RoomId;
    name: string;
    color: string;
    message: string;
    system?: boolean;
    email?: string | null;
    metadata?: Chat['metadata'] | null;
  },
  operation: SaveOperation
): Promise<{
  uuid: string;
  room_id: RoomId;
  time: number;
  ip_masked?: string;
  ua?: string;
}> {
  const { data, error } = await supabase.functions.invoke('save-chat', {
    body: payload,
    headers: {
      'x-chat-operation-id': operation.id,
      'x-chat-attempt': String(operation.attempt),
    },
  });
  if (error) throw new Error(`Failed to save chat: ${error.message}`);
  const result: unknown = data;
  if (typeof result === 'object' && result !== null && 'error' in result) {
    throw new Error(`Failed to save chat: ${String((result as { error: unknown }).error)}`);
  }
  if (
    typeof result !== 'object' ||
    result === null ||
    typeof (result as { uuid?: unknown }).uuid !== 'string' ||
    typeof (result as { time?: unknown }).time !== 'number'
  ) {
    throw new Error('Failed to save chat: unexpected response from Edge Function');
  }
  return result as {
    uuid: string;
    room_id: RoomId;
    time: number;
    ip_masked?: string;
    ua?: string;
  };
}

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
// apiCall には 1 から始まる試行番号を渡す（save-chat の x-chat-attempt に使う）
async function retryApiCall<T>(
  apiCall: (attempt: number) => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await measureApiCall(() => apiCall(attempt));
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
    // hasMore は snapshot 取得と同じ往復で確定した値を使う。
    // resourceLoadChatLogsSnapshot は { data, hasMore } を返すため、
    // 取得中に invalidateCache が走って世代が変わっても、この呼び出し固有の
    // hasMore がロストすることはない (#15 対策)。
    const { data: snapshot, hasMore: snapshotHasMore } = await resourceLoadChatLogsSnapshot(
      roomId,
      useCache
    );
    // hasMore は次の 2 条件のいずれかで真:
    //   (1) 要求 limit より snapshot が長い → snapshot 内に未表示分がある
    //   (2) snapshot 自体が canonical cap (MAX_CHAT_LOG) に張り付いており、
    //       テーブルにさらに続きが存在することが分かっている
    return {
      data: snapshot.slice(0, limit),
      hasMore: snapshot.length > limit || snapshotHasMore === true,
    };
  }

  const data = await resourceLoadChatLogsWithPaging(roomId, offset, limit, useCache);
  const exactHasMore = getPagingHasMore(roomId, offset, limit);
  return {
    data,
    hasMore: exactHasMore ?? data.length >= limit,
  };
}

/**
 * 初期表示用に直近 N 件だけ取得する。canonical snapshot のキャッシュは汚さない。
 * 入室時に全件へ広げる想定 (.kiro/specs/top-and-transition-performance Requirement 6)。
 */
export async function loadRecentChatLogs(
  roomId: RoomId = DEFAULT_ROOM_ID,
  limit = 10,
  useInflight = true
): Promise<Chat[]> {
  return resourceLoadRecentChatLogs(roomId, limit, useInflight);
}

// 初回読み込み時の最適化された関数
export async function loadInitialChatLogs(
  roomId: RoomId = DEFAULT_ROOM_ID,
  limit = 100
): Promise<Chat[]> {
  return resourceLoadInitialChatLogs(roomId, limit, true);
}

// 楽観的更新用の高速バージョン
// INSERT は save-chat Edge Function 経由（ip/ua をサーバー側で設定し、RLS を通過）
export async function saveChatLogOptimistic(
  roomId: RoomId = DEFAULT_ROOM_ID,
  chat: Chat
): Promise<Chat> {
  startPerf();
  const operationId = crypto.randomUUID();
  recordSendChat(operationId);

  return retryApiCall(async (attempt) => {
    const result = await invokeSaveChat(
      {
        room_id: roomId,
        name: chat.name,
        color: chat.color,
        message: chat.message,
        system: chat.system,
        email: chat.email,
        metadata: chat.metadata ?? null,
      },
      { id: operationId, attempt }
    );

    Promise.resolve().then(() => invalidateCache(roomId));
    endPerf('saveChatLogOptimistic');

    return {
      ...chat,
      uuid: result.uuid,
      room_id: result.room_id ?? roomId,
      time: result.time,
      // Edge Function が返すサーバー観測値で確定させる。これを反映しないと、
      // realtime INSERT が先に届いた場合に後着の HTTP 応答が空値で上書きし、
      // 送信者だけ IP / ブラウザ行が消える。
      ip_masked: result.ip_masked ?? chat.ip_masked,
      ua: result.ua ?? chat.ua,
      optimistic: false,
    };
  });
}

// 従来の互換性維持版（Edge Function 経由で ip/ua をサーバー確定）
export async function saveChatLog(roomId: RoomId = DEFAULT_ROOM_ID, chat: Chat): Promise<Chat> {
  startPerf();
  const operationId = crypto.randomUUID();
  recordSendChat(operationId);

  return retryApiCall(async (attempt) => {
    const result = await invokeSaveChat(
      {
        room_id: roomId,
        name: chat.name,
        color: chat.color,
        message: chat.message,
        system: chat.system,
        email: chat.email,
        metadata: chat.metadata ?? null,
      },
      { id: operationId, attempt }
    );

    invalidateCache(roomId);
    endPerf('saveChatLog');

    return {
      ...chat,
      uuid: result.uuid,
      room_id: result.room_id ?? roomId,
      time: result.time,
      // Edge Function が返すサーバー観測値で確定させる。これを反映しないと、
      // realtime INSERT が先に届いた場合に後着の HTTP 応答が空値で上書きし、
      // 送信者だけ IP / ブラウザ行が消える。
      ip_masked: result.ip_masked ?? chat.ip_masked,
      ua: result.ua ?? chat.ua,
      optimistic: false,
    };
  });
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

type ChatRankingRow = {
  name: string;
  post_count: number;
  last_time: number;
  color: string;
  host: string | null;
};

/**
 * 部屋の発言ランキングを全期間で取得する。
 *
 * 集計は chat_ranking ビューがサーバー側で行う (system 発言は除外、deleted は問わない)。
 * 以前は表示用に読み込んだ直近最大 100 件を手元で数えていたため、それより前にしか
 * 発言していないユーザーが載らず、発言回数も直近分だけになっていた。
 *
 * 転送量は発言者数ぶんだけで、総発言数には比例しない。
 */
export async function loadChatRanking(roomId: RoomId = DEFAULT_ROOM_ID): Promise<RankingEntry[]> {
  return retryApiCall(async () => {
    // オフライン時は手元のモックデータで数える
    if (!isOnline()) {
      return aggregateChatRanking(getOfflineChatData(roomId));
    }

    const { data, error } = await supabase
      .from(RANKING_VIEW)
      .select('name,post_count,last_time,color,host')
      .eq('room_id', roomId)
      .order('post_count', { ascending: false })
      .order('last_time', { ascending: false });

    if (error) {
      throw new Error(`Supabase ranking query error: ${error.message} (${error.code})`);
    }

    // 並びはサーバーで付けているが、クライアント集計と同じ比較関数で揃え直しておく
    // (同数・同時刻の並びをテスト / オフライン時と一致させるため)
    return ((data ?? []) as ChatRankingRow[])
      .map(
        (row): RankingEntry => ({
          name: row.name,
          count: row.post_count,
          lastTime: row.last_time,
          color: row.color,
          host: row.host ?? '',
        })
      )
      .sort(compareRankingEntries);
  });
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
      .select('uuid,room_id,name,color,message,time,system,email,ip_masked,ua,metadata')
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

/**
 * Realtime 購読の接続状態。
 * - `connecting`: channel を張った直後、最初の SUBSCRIBED を待っている
 * - `connected`: SUBSCRIBED 済み。新着は push で届く
 * - `disconnected`: CHANNEL_ERROR / TIMED_OUT / CLOSED。push が届かない
 */
export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

type PostgresListener = (chat: Chat) => void;
type StatusListener = (status: RealtimeStatus) => void;
type LookListener = (event: LookEvent) => void;

// Postgres Changes (INSERT) の購読 registry
type PostgresEntry = {
  channel: RealtimeChannel;
  listeners: Set<PostgresListener>;
  statusListeners: Set<StatusListener>;
  status: RealtimeStatus;
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
  const statusListeners = new Set<StatusListener>();
  const entry = {
    listeners,
    statusListeners,
    status: 'connecting',
  } as PostgresEntry;

  entry.channel = supabase
    .channel(`chats-postgres-${roomId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: TABLE, filter: `room_id=eq.${roomId}` },
      (payload) => {
        const chat = normalizeChat(payload.new);
        for (const listener of listeners) listener(chat);
      }
    )
    .subscribe((status: string) => {
      // SUBSCRIBED 以外 (CHANNEL_ERROR / TIMED_OUT / CLOSED) は push が届かない状態。
      // supabase-js が再接続に成功すると再び SUBSCRIBED が届く。
      const next: RealtimeStatus = status === 'SUBSCRIBED' ? 'connected' : 'disconnected';
      if (entry.status === next) return;
      entry.status = next;
      for (const listener of statusListeners) listener(next);
    });

  return entry;
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
 *
 * `onStatusChange` を渡すと接続状態の変化を受け取れる。購読者は「push が届いて
 * いるか」を知れるので、届かない間だけポーリングへフォールバックできる。
 */
export function subscribeChatLogs(
  roomId: RoomId,
  callback: PostgresListener,
  onStatusChange?: StatusListener
): { unsubscribe: () => void } {
  let entry = postgresEntries.get(roomId);
  if (!entry) {
    entry = createPostgresEntry(roomId);
    postgresEntries.set(roomId, entry);
  }
  entry.listeners.add(callback);

  const joined = entry;
  if (onStatusChange) {
    joined.statusListeners.add(onStatusChange);
    // 既に接続済みの channel に後から加わった購読者にも現在の状態を伝える。
    // 呼び出し元の effect 内で同期 setState が走らないよう microtask へ逃がし、
    // 状態は捕捉時ではなく通知時に読む (待っている間に変化しうるため)。
    void Promise.resolve().then(() => {
      if (joined.statusListeners.has(onStatusChange)) onStatusChange(joined.status);
    });
  }

  return {
    unsubscribe() {
      const current = postgresEntries.get(roomId);
      if (!current) return;
      current.listeners.delete(callback);
      if (onStatusChange) current.statusListeners.delete(onStatusChange);
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
  void Promise.resolve(entry.channel.send({ type: 'broadcast', event: 'look', payload })).finally(
    () => {
      if (hadListeners) return;
      const current = broadcastEntries.get(roomId);
      if (!current) return;
      if (current.listeners.size > 0) return; // 送信中に listener が登録されていたら維持
      supabase.removeChannel(current.channel);
      broadcastEntries.delete(roomId);
    }
  );
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
