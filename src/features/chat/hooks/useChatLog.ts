import { useCallback, useState, useEffect } from 'react';
import { loadChatLogs, postChat, clearChatLogs } from '@features/chat/api/chatApi';
import type { Chat } from '@features/chat/types';

export function useChatLog() {
  const [chatLog, setChatLog] = useState<Chat[]>([]);

  useEffect(() => {
    loadChatLogs().then(setChatLog);
  }, []);

  const addChat = useCallback(async (chat: Chat) => {
    setChatLog((prev) => {
      const updated = [chat, ...prev].slice(0, 2000);
      return updated;
    });
    await postChat(chat);
  }, []);

  const clear = useCallback(async () => {
    await clearChatLogs();
    setChatLog([]);
  }, []);

  return { chatLog, setChatLog, addChat, clear };
}
