import { useEffect, useEffectEvent, useOptimistic, useSyncExternalStore } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  getRoomLogStore,
  FULL_CHAT_LOG_LIMIT,
  INITIAL_CHAT_LOG_LIMIT,
  type RoomLogStore,
} from '@features/chat/api/roomLogStore';
import type { Chat } from '@features/chat/types';
import { DEFAULT_ROOM_ID, type RoomId } from '@features/chat/rooms';

function isSavedMatchForTemp(saved: Chat, temp: Chat): boolean {
  // 強い鍵: optimisticNonce が両側で揃っていれば、ユーザー間 / メッセージ間衝突なく一致判定できる。
  const tempNonce = temp.metadata?.optimisticNonce;
  const savedNonce = saved.metadata?.optimisticNonce;
  if (tempNonce && savedNonce) {
    return saved.optimistic !== true && tempNonce === savedNonce;
  }

  // 後方互換フォールバック: nonce 未付与の旧データ向け。
  // client_time が両側で数値であることを必須にし、未設定行同士 (undefined === undefined) で
  // 全く別メッセージが誤一致するのを防ぐ。
  if (typeof temp.client_time !== 'number' || typeof saved.client_time !== 'number') {
    return false;
  }
  return (
    saved.optimistic !== true &&
    saved.client_time === temp.client_time &&
    saved.name === temp.name &&
    saved.message === temp.message &&
    saved.room_id === temp.room_id &&
    saved.color === temp.color &&
    Boolean(saved.system) === Boolean(temp.system)
  );
}

export function reduceOptimisticChat(state: Chat[], chat: Chat): Chat[] {
  // temp UUID の楽観的更新は、対応する savedChat が
  // 既に base state に届いている場合は重複表示を避けるためスキップする
  if (chat.uuid.startsWith('temp-')) {
    const duplicate = state.some((c) => isSavedMatchForTemp(c, chat));
    if (duplicate) {
      return state;
    }
  }

  const index = state.findIndex((c) => c.uuid === chat.uuid);
  if (index !== -1) {
    const next = [...state];
    next[index] = chat;
    return next.slice(0, 2000);
  }
  return [chat, ...state].slice(0, 2000);
}

/**
 * 初期表示で取得する件数。LCP を縮めるため少量にとどめ、入室時に全件へ広げる。
 * (.kiro/specs/top-and-transition-performance Requirement 6)
 */
export { INITIAL_CHAT_LOG_LIMIT, FULL_CHAT_LOG_LIMIT };

/**
 * store の確定行を `setState` と同じ形で書き換える関数を作る（clear コマンドの表示への反映など）。
 * 呼び出し側の API を保つための互換レイヤー。
 */
export function createLogSetter(store: RoomLogStore): Dispatch<SetStateAction<Chat[]>> {
  return (action) => {
    store.update((previous) => (typeof action === 'function' ? action(previous) : action));
  };
}

/**
 * 部屋のログ。取得・Realtime の購読・取り直しの規則は Room_Log_Store が持ち、
 * ここは useSyncExternalStore で読んで useOptimistic を重ねるだけにする
 * （.kiro/specs/react-2026-refactoring Requirement 6）。
 */
export function useChatLog(
  roomId: RoomId = DEFAULT_ROOM_ID,
  onRealtimeChat?: (chat: Chat) => void
) {
  const store = getRoomLogStore(roomId);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [optimisticLog, addOptimistic] = useOptimistic(state.chats, reduceOptimisticChat);

  // 計測のコールバックは同一性が変わっても登録し直さない
  const handleRealtimeChat = useEffectEvent((chat: Chat) => onRealtimeChat?.(chat));
  useEffect(() => store.onInsert((chat) => handleRealtimeChat(chat)), [store]);

  return {
    chatLog: optimisticLog,
    isLoading: state.status === 'loading',
    loadError: state.status === 'error',
    realtimeStatus: state.realtime,
    setChatLog: createLogSetter(store),
    addOptimistic,
    mergeChat: store.applySaved,
    /**
     * 明示的な再読み込み。TTL キャッシュを迂回してサーバーから取り直す。
     * 他ユーザーの発言は Realtime でしか届かず resource キャッシュには反映されないため、
     * キャッシュ付きで取り直すと直近の発言がログから消えてしまう。
     */
    reload: store.reload,
    /**
     * 取得件数を広げる。入室時は既定の全件 (FULL_CHAT_LOG_LIMIT)、
     * 「ログ行数」で 100 件より多く選んだときはその件数を渡す。減らす方向には動かさない。
     */
    expandChatLog: (limit: number = FULL_CHAT_LOG_LIMIT) => store.expand(limit),
  };
}
