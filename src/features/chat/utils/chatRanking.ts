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

/**
 * 並び順は「発言回数の多い順 → 同数なら最終発言が新しい順」。
 * サーバー集計 (chat_ranking ビュー) の取得時も同じ順序で並べる。
 */
export function compareRankingEntries(a: RankingEntry, b: RankingEntry): number {
  return b.count - a.count || b.lastTime - a.lastTime;
}

/**
 * 手元のチャットログから発言ランキングを数える。
 *
 * 本番のランキングはサーバー側のビュー (chat_ranking) で全期間を集計しており、
 * これはオフライン時のフォールバックとテスト / Storybook 用。
 * 手元のログは直近分しか持たないため、これで本番のランキングを作ってはいけない。
 */
export function aggregateChatRanking(chatLog: Chat[]): RankingEntry[] {
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
  return Array.from(map.values()).sort(compareRankingEntries);
}
