import { useEffect, useEffectEvent, useOptimistic, useSyncExternalStore } from 'react';
import type { RoomLogStore } from '@features/chat/api/roomLogStore';
import { reduceOptimisticChat } from '@features/chat/utils/optimisticLog';
import type { Chat } from '@features/chat/types';

/**
 * Room_Log_Store を読み、楽観的な表示を重ねる（.kiro/specs/react-2026-refactoring Requirement 6）。
 * 取得・Realtime の購読・取り直しの規則は store が持つ。部屋単位（getRoomLogStore）と
 * 全部屋まとめ（getAllRoomsLogStore）のどちらの store でも同じように使う。
 *
 * @param onRealtimeChat Realtime の INSERT を受け取る（計測向け）。同一性が変わっても登録し直さない
 */
export function useRoomLog(store: RoomLogStore, onRealtimeChat?: (chat: Chat) => void) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [chatLog, addOptimistic] = useOptimistic(state.chats, reduceOptimisticChat);

  const handleRealtimeChat = useEffectEvent((chat: Chat) => onRealtimeChat?.(chat));
  useEffect(() => store.onInsert((chat) => handleRealtimeChat(chat)), [store]);

  const isLoading = state.status === 'loading';
  const loadError = state.status === 'error';

  return {
    /** 確定行に楽観的なチャットを重ねたログ */
    chatLog,
    isLoading,
    loadError,
    /** 読み込みが終わり、失敗もしておらず、1 件もない */
    isEmpty: !isLoading && !loadError && state.chats.length === 0,
    realtimeStatus: state.realtime,
    addOptimistic,
    /**
     * 明示的な再読み込み。キャッシュを迂回してサーバーから取り直す。
     * 他ユーザーの発言は Realtime でしか届かないため、キャッシュ付きで取り直すと直近の発言が消える。
     */
    reload: store.reload,
    /** 取得件数を広げる（減らす方向には動かさない） */
    expand: store.expand,
  };
}
