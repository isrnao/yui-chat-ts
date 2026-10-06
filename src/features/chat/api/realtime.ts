import type { Chat } from '@features/chat/types';
import type { RealtimeChannel } from '@supabase/realtime-js';
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
//
// look / unlook の通知音は、以前は broadcast の channel（chats-broadcast-<room>）で送っていた。今は保存された
// 発言の INSERT から鳴らす（useLookSound、Issue #184）ので、部屋のページが張る channel は 1 つだけ。

/**
 * Realtime 購読の接続状態。
 * - `connecting`: channel を張った直後、最初の SUBSCRIBED を待っている
 * - `connected`: SUBSCRIBED 済み。新着は push で届く
 * - `disconnected`: CHANNEL_ERROR / TIMED_OUT / CLOSED。push が届かない
 */
export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

type PostgresListener = (chat: Chat) => void;
type StatusListener = (status: RealtimeStatus) => void;

// Postgres Changes (INSERT) の購読 registry
type PostgresEntry = {
  channel: RealtimeChannel;
  listeners: Set<PostgresListener>;
  statusListeners: Set<StatusListener>;
  status: RealtimeStatus;
};
const postgresEntries = new Map<RoomId, PostgresEntry>();

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
