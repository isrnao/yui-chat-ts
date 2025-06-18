import { useCallback, useEffect, useState } from 'react';
import {
  loadChatLogs,
  saveChatLog,
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
    await saveChatLog(chat);
  }, []);

  const clear = useCallback(async () => {
    await clearChatLogs();
    // Supabaseリアルタイム購読でクリアが反映されるため、ローカル状態は変更しない
  }, []);

  return { chatLog, setChatLog, addChat, clear };
}
