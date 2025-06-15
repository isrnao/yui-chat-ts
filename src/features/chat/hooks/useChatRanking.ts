import { useMemo } from "react";
import type { Chat } from "@features/chat/types";

export function useChatRanking(chatLog: Chat[]) {
  return useMemo(() => {
    const map = new Map<string, { count: number; lastTime: number }>();
    chatLog.forEach((c) => {
      if (!c.system && c.name) {
        const rec = map.get(c.name) ?? { count: 0, lastTime: 0 };
        rec.count += 1;
        rec.lastTime = Math.max(rec.lastTime, c.time);
        map.set(c.name, rec);
      }
    });
    return Array.from(map.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count || b.lastTime - a.lastTime);
  }, [chatLog]);
}
