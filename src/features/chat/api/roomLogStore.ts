import type { Chat } from '@features/chat/types';
import type { RoomId } from '@features/chat/rooms';
import { mergeChatLogByUuid } from '@features/chat/utils/aggregatedLog';
import { loadAllRoomsChatLogs, loadRecentChatLogs } from './chatQueries';
import { subscribeAllRoomsChatLogs, subscribeChatLogs, type RealtimeStatus } from './realtime';

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

type ChatLogUpdate = (chats: Chat[]) => Chat[];

/** 取得と購読の差し替え口。部屋単位と全部屋まとめの違いはここに閉じ込める */
export interface LogSource {
  /** 初期表示で取得する件数 */
  initialLimit: number;
  /** 直近 `limit` 件を取得する。キャッシュは持たず、呼ぶたびにサーバーへ問い合わせる */
  fetch(limit: number): Promise<Chat[]>;
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
  /** サーバーから取り直す */
  reload(): void;
  /** 取得件数を増やす（減らさない）。既に足りていれば何もしない */
  expand(limit: number): void;
  /** 保存の確定値（や Realtime の INSERT）を uuid で合流させる */
  applySaved(chat: Chat): void;
  /** 確定行を直接書き換える（clear コマンドの表示への反映など） */
  update(updater: ChatLogUpdate): void;
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
  /** 取得の世代。新しい取得が始まったら古い取得の結果は捨てる */
  let generation = 0;
  /**
   * 取得中の新着（Realtime / 保存の確定値）と書き換え（clear など）を発生順に記録する。
   * 取得完了時も同じ順で適用し、削除後に届いた新着へ過去の clear を適用しない。
   */
  let updatesDuringFetch: ChatLogUpdate[] | null = null;
  let releaseScheduled = false;

  const setState = (next: Partial<RoomLogState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };

  const applyUpdate = (updater: ChatLogUpdate) => {
    updatesDuringFetch?.push(updater);
    setState({ chats: updater(state.chats) });
  };

  const stopTracking = (updates: ChatLogUpdate[]) => {
    if (updatesDuringFetch === updates) updatesDuringFetch = null;
  };

  const startFetch = () => {
    const current = ++generation;
    const updates: ChatLogUpdate[] = [];
    updatesDuringFetch = updates;
    const requested = limit;
    const isExpansion = requested > displayedLimit;
    // 拡張で残すのは取得開始時のログ。取得中の変更は下の updates で順番に反映する。
    const previousChats = state.chats;

    source.fetch(requested).then(
      (logs) => {
        if (current !== generation) return;
        displayedLimit = requested;
        // 拡張のときだけ表示中の発言を残す。それ以外は取得結果を正とする
        // （別クライアントで論理削除された発言や、件数の窓から外れた発言を残さないため）
        let chats = isExpansion ? mergeChatLogByUuid(logs, previousChats) : logs;
        for (const update of updates) chats = update(chats);
        stopTracking(updates);
        setState({ status: 'ready', chats });
      },
      () => {
        if (current !== generation) return;
        stopTracking(updates);
        setState({ status: 'error' });
      }
    );
  };

  const handleInsert = (chat: Chat) => {
    for (const listener of insertListeners) listener(chat);
    applyUpdate((chats) => mergeChatLogByUuid(chats, chat));
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
    lastStatus = 'connecting';
    // 購読の確立を先に始めてから取得する
    realtime = source.subscribe(handleInsert, handleStatus);
    startFetch();
  };

  const dispose = () => {
    realtime?.unsubscribe();
    realtime = null;
    generation++; // 進行中の取得の結果を捨てる
    updatesDuringFetch = null;
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
      startFetch();
    },
    expand(next) {
      if (next <= limit) return;
      limit = next;
      startFetch();
    },
    applySaved(chat) {
      // 保存の確定値も clear と同じ列に記録し、取得完了時に発生順で反映する
      applyUpdate((chats) => mergeChatLogByUuid(chats, chat));
    },
    update: applyUpdate,
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
    fetch: (limit) => loadRecentChatLogs(roomId, limit),
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
