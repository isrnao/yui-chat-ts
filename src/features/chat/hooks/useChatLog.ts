import { useCallback, useState, useEffect } from 'react';
import { loadChatLogs, saveChatLogs, clearChatLogs } from '@features/chat/api/chatApi';
import type { Chat } from '@features/chat/types';

export function useChatLog() {
  const [chatLog, setChatLog] = useState<Chat[]>([]);

  useEffect(() => {
    loadChatLogs().then((logs) => setChatLog(logs));
  }, []);

  const addChat = useCallback((chat: Chat) => {
    setChatLog((prev) => {
      const updated = [chat, ...prev].slice(0, 2000);
      void saveChatLogs(updated);
      return updated;
    });
  }, []);

  const clear = useCallback(() => {
    void clearChatLogs();
    setChatLog([]);
  }, []);

  return { chatLog, setChatLog, addChat, clear };
}
