import { useCallback } from "react";
import type { Chat } from "../types";

const DEFAULT_KEY = "yui_chat_dat";
const DEFAULT_MAX = 2000;

export function useChatLogStorage(
  key: string = DEFAULT_KEY,
  max: number = DEFAULT_MAX
) {
  const load = useCallback((): Chat[] => {
    try {
      const dat = localStorage.getItem(key);
      return dat ? JSON.parse(dat) : [];
    } catch {
      return [];
    }
  }, [key]);

  const save = useCallback(
    (log: Chat[]) => {
      localStorage.setItem(key, JSON.stringify(log.slice(0, max)));
    },
    [key, max]
  );

  const clear = useCallback(() => {
    localStorage.removeItem(key);
  }, [key]);

  return { load, save, clear };
}
