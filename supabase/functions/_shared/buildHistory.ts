import { RECENT_WINDOW_MS, type ParticipantRow } from './participants.ts';

export type OpenAIMessage = {
  role: 'user' | 'assistant';
  content: string;
};

/**
 * 直近ログから OpenAI へ渡す会話履歴を整形する。
 * cap 件までに制限し、Bot 発言を assistant、実ユーザー発言を user にマップする。
 * cap === 0 の場合は空配列を返す (R8.6)。
 */
export function buildHistory(
  logs: ParticipantRow[],
  cap: number,
  now: number = Date.now(),
): OpenAIMessage[] {
  if (cap <= 0) return [];

  const recent = logs
    .filter(
      (c) =>
        now - c.time <= RECENT_WINDOW_MS &&
        !c.system &&
        c.metadata?.kind !== 'admin' &&
        c.metadata?.kind !== 'fortune',
    )
    .slice()
    .sort((a, b) => a.time - b.time);

  const sliced = recent.length > cap ? recent.slice(recent.length - cap) : recent;

  return sliced.map((c) => ({
    role: c.metadata?.kind === 'bot' ? 'assistant' : 'user',
    content: c.name ? `${c.name}: ${c.message}` : c.message,
  }));
}
