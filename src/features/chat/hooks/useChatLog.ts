import { useCallback, useState, useEffect } from 'react';
import {
  loadChatLogs,
  saveChatLogs,
  clearChatLogs,
  subscribeChatLogs,
} from '@features/chat/api/chatApi';
import type { Chat } from '@features/chat/types';

export function useChatLog() {
  const [chatLog, setChatLog] = useState<Chat[]>([]);

  useEffect(() => {
    loadChatLogs().then(setChatLog);
    const channel = subscribeChatLogs((chat) => {
      setChatLog((prev) => [chat, ...prev].slice(0, 2000));
    });
    return () => {
      channel.unsubscribe();
    };
  }, []);

  const addChat = useCallback(async (chat: Chat) => {
    setChatLog((prev) => [chat, ...prev].slice(0, 2000));
    await saveChatLogs(chat);
  }, []);

  const clear = useCallback(async () => {
    await clearChatLogs();
    setChatLog([]);
  }, []);

  return { chatLog, setChatLog, addChat, clear };
}
