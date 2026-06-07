import { useDeferredValue, useMemo } from 'react';
import type { Chat } from '@features/chat/types';
import { getRecentParticipants } from '@features/chat/utils/participants';

export { getRecentParticipants } from '@features/chat/utils/participants';

export function useParticipants(chatLog: Chat[]) {
  const deferredChatLog = useDeferredValue(chatLog);
  return useMemo(() => getRecentParticipants(deferredChatLog), [deferredChatLog]);
}
