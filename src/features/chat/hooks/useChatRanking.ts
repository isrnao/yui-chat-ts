import { useMemo } from 'react';
import type { Chat } from '@features/chat/types';

export type RankingEntry = {
  name: string;
  count: number;
  lastTime: number;
  /** 名前の表示色。レガシーは <font color> で発言者の色を付けていた */
  color: string;
  /** ホスト情報。レガシーは生 IP を出していたが、こちらはマスク済みの値を使う */
  host: string;
};

export function useChatRanking(chatLog: Chat[]): RankingEntry[] {
  return useMemo(() => {
    const map = new Map<string, RankingEntry>();
    chatLog.forEach((c) => {
      if (!c.system && c.name) {
        const rec = map.get(c.name) ?? {
          name: c.name,
          count: 0,
          lastTime: 0,
          color: c.color,
          host: c.ip_masked,
        };
        rec.count += 1;
        // 色とホストは最終発言のものを採用する
        if (c.time >= rec.lastTime) {
          rec.lastTime = c.time;
          rec.color = c.color;
          rec.host = c.ip_masked;
        }
        map.set(c.name, rec);
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count || b.lastTime - a.lastTime);
  }, [chatLog]);
}
