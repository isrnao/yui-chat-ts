import { useMemo } from 'react';
import { useChatActions } from '@yui/shared/chat/hooks/useChatActions';
import { validateName } from '@yui/shared/chat/validation';
import { useChatServices } from '../context/ChatContext';
import { useChatSessionContext } from '../context/ChatSessionContext';

export function useChatActionsMobile(onCommand?: (command: string) => void) {
  const { chatApi, fetchClientInfo } = useChatServices();
  const session = useChatSessionContext();

  const commandHandlers = useMemo(
    () => ({
      clear: async () => {
        await session.clear();
      },
    }),
    [session],
  );

  return useChatActions({
    chatApi,
    session,
    fetchClientInfo,
    validateName,
    commandHandlers,
    onCommand,
  });
}
