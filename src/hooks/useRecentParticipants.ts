import { useDeferredValue } from "react";
import type { Chat } from "../types";
import { getRecentParticipants } from "./useParticipants";

export function useRecentParticipants(chatLog: Chat[]) {
  return useDeferredValue(getRecentParticipants(chatLog));
}
