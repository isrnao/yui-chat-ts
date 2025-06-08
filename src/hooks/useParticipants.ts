import { useDeferredValue } from "react";
import type { Chat, Participant } from "@/types";

export function getRecentParticipants(chatLog: Chat[]): Participant[] {
  const now = Date.now();
  return Array.from(
    chatLog
      .filter(c => c.name && c.color && !c.system && now - c.time <= 5 * 60 * 1000)
      .reduce((map, c) => {
        map.set(c.name, { id: c.name, name: c.name, color: c.color });
        return map;
      }, new Map<string, Participant>())
      .values()
  );
}

export function useParticipants(chatLog: Chat[]) {
  return useDeferredValue(getRecentParticipants(chatLog));
}
