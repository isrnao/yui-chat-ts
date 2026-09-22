import type { Chat } from '@features/chat/types';
import type { RoomId } from '@features/chat/rooms';
import { mergeChatLogByUuid } from '@features/chat/utils/aggregatedLog';
import {
  loadChatLogs,
  loadRecentChatLogs,
  subscribeChatLogs,
  type RealtimeStatus,
} from './chatApi';
import { loadAllRoomsChatLogs, subscribeAllRoomsChatLogs } from './chatAllApi';

/**
 * Room_Log_Store（.kiro/specs/react-2026-refactoring Requirement 6）。
 *
 * 部屋（または全部屋まとめ）のログについて、スナップショットの取得、Realtime の購読、
 * 取得中に届いた発言のバッファ、接続確立時の取り直し、取得件数の拡張をまとめて持つ。
 * コンポーネントは useSyncExternalStore で読み、取得や購読を Effect の依存配列で制御しない。
 *
 * 以前は useChatLog が reloadKey / logLimit / ref 2 本 / Effect 2 本で同じ規則を表していた。
 */

export type RoomLogState = {
  /** 最初の取得が終わるまで 'loading'。直近の取得が失敗していれば 'error'（表示中の行は残す） */
  status: 'loading' | 'ready' | 'error';
  /** サーバーで確定した行だけ。uuid v7 の降順 */
  chats: Chat[];
  realtime: RealtimeStatus;
};

/** 取得と購読の差し替え口。部屋単位と全部屋まとめの違いはここに閉じ込める */
export interface LogSource {
  /** 初期表示で取得する件数 */
  initialLimit: number;
  /**
   * @param allowShared true なら進行中のリクエストやキャッシュを共有してよい
   *   （購読を始めてから一度も取り直していないとき）。取り直しでは必ず実取得する
   */
  fetch(limit: number, allowShared: boolean): Promise<Chat[]>;
  subscribe(
    onInsert: (chat: Chat) => void,
    onStatus: (status: RealtimeStatus) => void
  ): { unsubscribe(): void };
}

export interface RoomLogStore {
  /** 最初の購読で取得と Realtime を始め、最後の解除で止める */
  subscribe(listener: () => void): () => void;
  /** 変化がなければ同じ参照を返す */
  getSnapshot(): RoomLogState;
  /** SSG / hydration 用。最初の getSnapshot と同じ参照 */
  getServerSnapshot(): RoomLogState;
  /** キャッシュや進行中のリクエストを使わずに取り直す */
  reload(): void;
  /** 取得件数を増やす（減らさない）。既に足りていれば何もしない */
  expand(limit: number): void;
  /** 保存の確定値（や Realtime の INSERT）を uuid で合流させる */
  applySaved(chat: Chat): void;
  /** 確定行を直接書き換える（clear コマンドの表示への反映など） */
  update(updater: (chats: Chat[]) => Chat[]): void;
  /** Realtime の INSERT を受け取る（計測向け）。解除関数を返す */
  onInsert(listener: (chat: Chat) => void): () => void;
}

/** 部屋単位のログ: 初期 10 件、入室で 100 件（canonical snapshot）、行数の選択で最大 1000 件 */
export const INITIAL_CHAT_LOG_LIMIT = 10;
export const FULL_CHAT_LOG_LIMIT = 100;
/** 全部屋まとめで最初に取得する件数 */
export const ALL_ROOMS_INITIAL_LIMIT = 200;

export function createRoomLogStore(source: LogSource): RoomLogStore {
  const initialState: RoomLogState = { status: 'loading', chats: [], realtime: 'connecting' };
  let state = initialState;
  const listeners = new Set<() => void>();
  const insertListeners = new Set<(chat: Chat) => void>();

  let realtime: { unsubscribe(): void } | null = null;
  let lastStatus: RealtimeStatus = 'connecting';
  let limit = source.initialLimit;
  /** 画面に出しているログが何件要求の結果か。拡張（既存を残す取得）かどうかの判定に使う */
  let displayedLimit = source.initialLimit;
  /** 取り直しの回数。0 の間だけ進行中のリクエストやキャッシュを共有してよい */
  let reloadCount = 0;
  /** 取得の世代。新しい取得が始まったら古い取得の結果は捨てる */
  let generation = 0;
  /** 進行中の取得の間に届いた発言。取得結果に含まれないことがあるので完了時に足す */
  let arrivedDuringFetch: Chat[] | null = null;
  let releaseScheduled = false;

  const setState = (next: Partial<RoomLogState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };

  const startFetch = () => {
    const current = ++generation;
    const buffer: Chat[] = [];
    arrivedDuringFetch = buffer;
    const requested = limit;
    const isExpansion = requested > displayedLimit;

    source.fetch(requested, reloadCount === 0).then(
      (logs) => {
        if (current !== generation) return;
        displayedLimit = requested;
        // 拡張のときだけ表示中の発言を残す。それ以外は取得結果を正とする
        // （別クライアントで論理削除された発言や、件数の窓から外れた発言を残さないため）
        const chats = isExpansion
          ? mergeChatLogByUuid(logs, [...state.chats, ...buffer])
          : mergeChatLogByUuid(logs, buffer);
        if (arrivedDuringFetch === buffer) arrivedDuringFetch = null;
        setState({ status: 'ready', chats });
      },
      () => {
        if (current !== generation) return;
        if (arrivedDuringFetch === buffer) arrivedDuringFetch = null;
        setState({ status: 'error' });
      }
    );
  };

  const handleInsert = (chat: Chat) => {
    for (const listener of insertListeners) listener(chat);
    arrivedDuringFetch?.push(chat);
    setState({ chats: mergeChatLogByUuid(state.chats, chat) });
  };

  const handleStatus = (status: RealtimeStatus) => {
    const previous = lastStatus;
    lastStatus = status;
    if (state.realtime !== status) setState({ realtime: status });
    // 接続が確立した時点で一度だけ取り直し、push が届いていなかった間の穴を塞ぐ。
    // 購読は SUBSCRIBED を待たずに返るため、初回は「snapshot が確定した時刻」から
    // 「SUBSCRIBED 到達」までの INSERT がどこにも入らない。再接続時も、切れていた間の
    // 発言は再配送されない。取得の開始自体は接続を待たない（初回描画を待たせないため）。
    if (status === 'connected' && previous !== 'connected') store.reload();
  };

  const start = () => {
    // 購読し直すときは、前回の表示の続きではなく新しいページ表示として始める
    // （以前の useChatLog が roomId の変化で状態を巻き戻していたのと同じ）
    state = initialState;
    limit = source.initialLimit;
    displayedLimit = source.initialLimit;
    reloadCount = 0;
    lastStatus = 'connecting';
    // 購読の確立を先に始めてから取得する
    realtime = source.subscribe(handleInsert, handleStatus);
    startFetch();
  };

  const dispose = () => {
    realtime?.unsubscribe();
    realtime = null;
    generation++; // 進行中の取得の結果を捨てる
    arrivedDuringFetch = null;
  };

  const store: RoomLogStore = {
    subscribe(listener) {
      const wasIdle = listeners.size === 0;
      listeners.add(listener);
      if (wasIdle && realtime === null) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0 || releaseScheduled) return;
        // StrictMode は購読 → 解除 → 再購読を同期で行う。すぐに channel を外すと
        // 張り直しになるので、マイクロタスクまで待ってからまだ誰もいなければ止める
        releaseScheduled = true;
        queueMicrotask(() => {
          releaseScheduled = false;
          if (listeners.size === 0) dispose();
        });
      };
    },
    getSnapshot: () => state,
    getServerSnapshot: () => initialState,
    reload() {
      reloadCount++;
      startFetch();
    },
    expand(next) {
      if (next <= limit) return;
      limit = next;
      startFetch();
    },
    applySaved(chat) {
      setState({ chats: mergeChatLogByUuid(state.chats, chat) });
    },
    update(updater) {
      setState({ chats: updater(state.chats) });
    },
    onInsert(listener) {
      insertListeners.add(listener);
      return () => {
        insertListeners.delete(listener);
      };
    },
  };
  return store;
}

function roomSource(roomId: RoomId): LogSource {
  return {
    initialLimit: INITIAL_CHAT_LOG_LIMIT,
    // ちょうど全件（100）のときだけ canonical snapshot（キャッシュあり）を使う
    fetch: (limit, allowShared) =>
      limit === FULL_CHAT_LOG_LIMIT
        ? loadChatLogs(roomId, allowShared)
        : loadRecentChatLogs(roomId, limit, allowShared),
    subscribe: (onInsert, onStatus) => subscribeChatLogs(roomId, onInsert, onStatus),
  };
}

const allRoomsSource: LogSource = {
  initialLimit: ALL_ROOMS_INITIAL_LIMIT,
  fetch: (limit) => loadAllRoomsChatLogs(limit),
  subscribe: (onInsert, onStatus) => subscribeAllRoomsChatLogs(onInsert, onStatus),
};

// store は部屋ごとに 1 つを作って使い回す（部屋の数だけなので上限がある）。
// 購読がすべて外れると取得と Realtime を止め、次の購読で状態を初期化して再開する。
const roomStores = new Map<RoomId, RoomLogStore>();
let allRoomsStore: RoomLogStore | null = null;

/** 部屋のログの store。部屋ごとに 1 つを共有する */
export function getRoomLogStore(roomId: RoomId): RoomLogStore {
  let store = roomStores.get(roomId);
  if (!store) {
    store = createRoomLogStore(roomSource(roomId));
    roomStores.set(roomId, store);
  }
  return store;
}

/** 全部屋まとめのログの store */
export function getAllRoomsLogStore(): RoomLogStore {
  allRoomsStore ??= createRoomLogStore(allRoomsSource);
  return allRoomsStore;
}
