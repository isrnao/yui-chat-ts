import { useDeferredValue } from "react";
export function useRecentParticipants(chatLog: Chat[]) {
  return useDeferredValue(getRecentParticipants(chatLog));
}
