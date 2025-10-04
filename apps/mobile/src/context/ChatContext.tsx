import React, { createContext, useContext, useMemo } from 'react';
import { getChatApi } from '../services/chatApi';
import type { ChatApi } from '@yui/shared/api/chat';
import { getClientIP, getUserAgent } from '@yui/shared/platform/clientInfo';

export type ChatContextValue = {
  chatApi: ChatApi;
  fetchClientInfo: () => Promise<{ ip: string; ua: string }>;
};

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<ChatContextValue>(() => {
    const chatApi = getChatApi();
    return {
      chatApi,
      fetchClientInfo: async () => ({
        ip: await getClientIP(),
        ua: getUserAgent(),
      }),
    };
  }, []);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatServices() {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChatServices must be used within ChatProvider');
  return context;
}
