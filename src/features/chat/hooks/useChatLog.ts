import {
  useCallback,
  useEffect,
  useState,
  useOptimistic,
  startTransition,
} from 'react';
import {
  loadChatLogs,
  saveChatLog,
  clearChatLogs,
  subscribeChatLogs,
} from '@features/chat/api/chatApi';
import type { Chat } from '@features/chat/types';

export function useChatLog() {
  const [chatLog, setChatLog] = useState<Chat[]>([]);
  const [optimisticLog, addOptimistic] = useOptimistic(
    chatLog,
    (state: Chat[], chat: Chat) => {
      const index = state.findIndex((c) => c.id === chat.id);
      if (index !== -1) {
        const next = [...state];
        next[index] = chat;
        return next.slice(0, 2000);
      }
      return [chat, ...state].slice(0, 2000);
    }
  );

  useEffect(() => {
    loadChatLogs().then(setChatLog);
    const channel = subscribeChatLogs((chat) => {
      setChatLog((prev) => {
        const idx = prev.findIndex((c) => c.id === chat.id);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = chat;
          return next.slice(0, 2000);
        }
        return [chat, ...prev].slice(0, 2000);
      });
    });
    return () => {
      channel.unsubscribe();
    };
  }, []);

  const addChat = useCallback(
    async (chat: Chat) => {
      startTransition(() => {
        addOptimistic(chat);
      });
      await saveChatLog(chat);
    },
    [addOptimistic]
  );

  const clear = useCallback(async () => {
    await clearChatLogs();
    // Supabaseリアルタイム購読でクリアが反映されるため、ローカル状態は変更しない
  }, []);

  return {
    chatLog: optimisticLog,
    setChatLog,
    addChat,
    addOptimistic,
    clear,
  };
}
