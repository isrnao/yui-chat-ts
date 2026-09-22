import {
  useEffect,
  useEffectEvent,
  useOptimistic,
  useSyncExternalStore,
  startTransition,
} from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { getAllRoomsLogStore, ALL_ROOMS_INITIAL_LIMIT } from '@features/chat/api/roomLogStore';
import { createLogSetter, reduceOptimisticChat } from './useChatLog';
import type { Chat } from '@features/chat/types';

/** 全部屋まとめで最初に取得する件数 */
export { ALL_ROOMS_INITIAL_LIMIT };

/**
 * 全部屋まとめのログ。部屋単位のログと同じ Room_Log_Store の実装を使う
 * （接続確立時の取り直しも部屋単位と同じ規則で行う）。
 *
 * @param limit 取得件数。「ログ行数」で 200 件より多く選ばれたときに呼び出し元が広げる。
 */
export function useAllRoomsChatLog(
  onRealtimeChat?: (chat: Chat) => void,
  limit: number = ALL_ROOMS_INITIAL_LIMIT
): {
  chatLog: Chat[];
  isLoading: boolean;
  loadError: boolean;
  subscribeError: boolean;
  isEmpty: boolean;
  setChatLog: Dispatch<SetStateAction<Chat[]>>;
  addOptimistic: (chat: Chat) => void;
  mergeChat: (chat: Chat) => void;
  reload: () => void;
} {
  const store = getAllRoomsLogStore();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [chatLog, addOptimisticInternal] = useOptimistic(state.chats, reduceOptimisticChat);

  const handleRealtimeChat = useEffectEvent((chat: Chat) => onRealtimeChat?.(chat));
  useEffect(() => store.onInsert((chat) => handleRealtimeChat(chat)), [store]);

  // 取得件数は増やす方向にだけ広げる（store.expand が小さい値を無視する）
  useEffect(() => {
    store.expand(limit);
  }, [store, limit]);

  const isLoading = state.status === 'loading';
  const loadError = state.status === 'error';

  return {
    chatLog,
    isLoading,
    loadError,
    subscribeError: state.realtime === 'disconnected',
    isEmpty: !isLoading && !loadError && state.chats.length === 0,
    setChatLog: createLogSetter(store),
    addOptimistic: (chat: Chat) => {
      startTransition(() => {
        addOptimisticInternal(chat);
      });
    },
    mergeChat: store.applySaved,
    reload: store.reload,
  };
}
