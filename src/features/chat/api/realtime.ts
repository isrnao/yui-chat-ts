import type { Chat } from '@features/chat/types';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@shared/supabaseClient';
import { normalizeChat } from '../utils/normalizeMetadata';
import type { RoomId } from '../rooms';

const TABLE = 'chats';

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
        void supabase.removeChannel(current.channel);
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
      void supabase.removeChannel(current.channel);
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
      void supabase.removeChannel(current.channel);
      broadcastEntries.delete(roomId);
    }
  };
}

/**
 * 横断購読: room_id フィルタなしの単一 channel で全 INSERT を受ける。
 * onStatusChange には部屋単位の購読（subscribeChatLogs）と同じ形で接続状態を伝える。
 * SUBSCRIBED で connected、CHANNEL_ERROR / TIMED_OUT / CLOSED で disconnected。
 */
export function subscribeAllRoomsChatLogs(
  callback: (chat: Chat) => void,
  onStatusChange?: (status: RealtimeStatus) => void
): {
  unsubscribe: () => void;
} {
  const channel = supabase
    .channel('chats-postgres-all')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLE }, (payload) => {
      // 初期ロードの SELECT_COLUMNS は email / ua を含まない。realtime payload には
      // 含まれるため、ここで落として形を揃える。揃えないと同じ発言が「到着直後は
      // UA / メールリンクあり、再読み込み後はなし」という不整合を起こす。
      callback({ ...normalizeChat(payload.new), email: undefined, ua: '' });
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        onStatusChange?.('connected');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        onStatusChange?.('disconnected');
      }
    });

  return {
    unsubscribe() {
      void supabase.removeChannel(channel);
    },
  };
}
