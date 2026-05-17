import { useCallback, useEffect, useState, useOptimistic, startTransition } from 'react';
import {
  loadChatLogs,
  saveChatLog,
  clearChatLogs,
  subscribeChatLogs,
} from '@features/chat/api/chatApi';
import { useResetOnChange } from '@shared/hooks/useResetOnChange';
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

export function useChatLog(roomId: RoomId = DEFAULT_ROOM_ID) {
  const [chatLog, setChatLog] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // roomId 変更時は reload 開始状態へ巻き戻す (useResetOnChange = 公式推奨「前回値検知」パターン)
  useResetOnChange(roomId, () => {
    setChatLog([]);
    setIsLoading(true);
  });

  const mergeChat = useCallback(
    (chat: Chat) => {
      setChatLog((prev) => {
        const idx = prev.findIndex((c) => c.uuid === chat.uuid);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = chat;
          return next.slice(0, 2000);
        }
        return [chat, ...prev].slice(0, 2000);
      });
    },
    [setChatLog]
  );
  const [optimisticLog, addOptimistic] = useOptimistic(chatLog, reduceOptimisticChat);

  useEffect(() => {
    let ignore = false;
    loadChatLogs(roomId)
      .then((logs) => {
        if (!ignore) setChatLog(logs);
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });
    const channel = subscribeChatLogs(roomId, (chat) => {
      mergeChat(chat);
    });
    return () => {
      ignore = true;
      channel.unsubscribe();
    };
  }, [mergeChat, roomId]);

  const addChat = useCallback(
    async (chat: Chat) => {
      startTransition(() => {
        addOptimistic(chat);
      });
      await saveChatLog(roomId, chat);
      startTransition(() => {
        mergeChat(chat);
      });
    },
    [addOptimistic, mergeChat, roomId]
  );

  const clear = useCallback(async () => {
    await clearChatLogs(roomId);
    // Supabaseリアルタイム購読でクリアが反映されるため、ローカル状態は変更しない
  }, [roomId]);

  return {
    chatLog: optimisticLog,
    isLoading,
    setChatLog,
    addChat,
    addOptimistic,
    mergeChat,
    clear,
  };
}
