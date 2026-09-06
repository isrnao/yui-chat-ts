import { getRecentParticipants, RECENT_WINDOW_MS, type ParticipantRow } from './participants.ts';
import { buildHistory, type OpenAIMessage } from './buildHistory.ts';
import type { BotConfig } from './botConfig.ts';

export type { BotConfig } from './botConfig.ts';
export type { OpenAIMessage } from './buildHistory.ts';
export type { ParticipantRow as ChatRow } from './participants.ts';

export type IgnoreReason =
  | 'loop'         // kind==='bot': ループ防止 (R4.1)
  | 'other-room'   // room_id !== targetRoom (R10.1)
  | 'no-real-user' // 実ユーザー0人 (R3.6, R6.1)
  | 'non-target'   // system/admin/fortune: 応答対象外 (R3.5)
  | 'cooldown';    // クールダウン未経過 (R8.1)

export type BotAction =
  | { type: 'ignore'; reason: IgnoreReason }
  | { type: 'greet'; messages: string[] }
  | { type: 'respond'; responseDelayMs: number; history: OpenAIMessage[] };

export type TriggerRecord = ParticipantRow & { room_id?: string };

export function pickInRange(min: number, max: number, rng: () => number = Math.random): number {
  if (max <= min) return min;
  return Math.floor(min + rng() * (max - min));
}

export function lastBotMessageTime(logs: ParticipantRow[], now: number): number | null {
  let latest: number | null = null;
  for (const c of logs) {
    if (c.metadata?.kind === 'bot' && now - c.time <= RECENT_WINDOW_MS) {
      if (latest === null || c.time > latest) latest = c.time;
    }
  }
  return latest;
}

/**
 * 純粋な意思決定関数。I/O を持たず、入力のみから BotAction を決定する。
 * 判定順序は設計書の①〜⑧に厳密に従う。
 */
export function decideBotAction(
  record: TriggerRecord,
  recentLogs: ParticipantRow[],
  config: BotConfig,
  now: number,
  rng: () => number = Math.random,
): BotAction {
  // ① ループ防止(最優先) R4.1, R4.2, R11.3
  if (record.metadata?.kind === 'bot') {
    return { type: 'ignore', reason: 'loop' };
  }

  // ② ルーム限定(高コスト処理の前) R10.1, R10.2
  if (record.room_id !== config.targetRoom) {
    return { type: 'ignore', reason: 'other-room' };
  }

  // ④ 参加者判定 R3.6, R6.1, R6.3
  const realUsers = getRecentParticipants(recentLogs, now);
  if (realUsers.length === 0) {
    return { type: 'ignore', reason: 'no-real-user' };
  }

  // ⑤ 冪等な登場: 直近5分に Bot 発言がなければ挨拶 R2.2, R2.3, R2.5
  const latestBotTime = lastBotMessageTime(recentLogs, now);
  if (latestBotTime === null) {
    return { type: 'greet', messages: config.greetings }; // R2.4 連続投稿
  }

  // ③ 非対象メッセージは応答しない(登場評価は⑤で済み) R3.5
  if (record.system || record.metadata?.kind === 'admin' || record.metadata?.kind === 'fortune') {
    return { type: 'ignore', reason: 'non-target' };
  }

  // ⑥ クールダウン R8.1, R8.4, R8.7
  const cooldownMs = pickInRange(config.cooldownMinMs, config.cooldownMaxMs, rng);
  if (now - latestBotTime < cooldownMs) {
    return { type: 'ignore', reason: 'cooldown' };
  }

  // ⑦+⑧ 応答プラン(実際の wait/OpenAI は呼び出し側) R8.2, R8.5, R8.6, R3.8
  const responseDelayMs = pickInRange(config.responseDelayMinMs, config.responseDelayMaxMs, rng);
  const history = buildHistory(recentLogs, config.historyMessageCap, now);
  return { type: 'respond', responseDelayMs, history };
}
