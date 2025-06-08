import { useDeferredValue } from "react";
import type { Chat } from "../types";

export function useChatDisplayLog(chatLog: Chat[], windowRows: number) {
  const deferredLog = useDeferredValue(chatLog);
  return [...deferredLog].sort((a, b) => b.time - a.time).slice(0, windowRows);
}
