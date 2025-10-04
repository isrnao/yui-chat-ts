import React, { createContext, useContext } from 'react';
import { useChatSession, type UseChatSessionResult } from '@yui/shared/chat/hooks';
import { useChatServices } from './ChatContext';

const ChatSessionContext = createContext<UseChatSessionResult | undefined>(undefined);

export function ChatSessionProvider({ children }: { children: React.ReactNode }) {
  const { chatApi } = useChatServices();
  const session = useChatSession({ chatApi, realtime: true });
  return <ChatSessionContext.Provider value={session}>{children}</ChatSessionContext.Provider>;
}

export function useChatSessionContext() {
  const context = useContext(ChatSessionContext);
  if (!context) throw new Error('useChatSessionContext must be used within ChatSessionProvider');
  return context;
}
