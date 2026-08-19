import type { Participant } from '@features/chat/types';

export { type Participant };
export const RECENT_WINDOW_MS = 5 * 60 * 1000;

const WELCOME_PATTERN = /^(.+?)\sさん、Welcome to/;
const EXIT_PATTERN = /^(.+?)さん、またきておくれやすぅ/;

export type ParticipantRow = {
  uuid: string;
  name: string;
  color: string;
  message: string;
  time: number;
  system?: boolean;
  metadata?: { kind?: string; userColor?: string } | null;
};

export function getRecentParticipants(
  chatLog: ParticipantRow[],
  now: number = Date.now(),
): Participant[] {
  const map = new Map<string, Participant>();
  const recent = chatLog
    .filter((c) => now - c.time <= RECENT_WINDOW_MS)
    .slice()
    .sort((a, b) => a.time - b.time);

  for (const c of recent) {
    if (c.metadata?.kind === 'bot') continue; // Bot は実ユーザーに数えない (R5.6)
    if (c.metadata?.kind === 'admin') {
      const enterMatch = c.message.match(WELCOME_PATTERN);
      if (enterMatch) {
        const name = enterMatch[1].trim();
        const color = c.metadata.userColor ?? '#333333';
        map.set(name, { uuid: c.uuid, name, color });
        continue;
      }
      const exitMatch = c.message.match(EXIT_PATTERN);
      if (exitMatch) {
        map.delete(exitMatch[1].trim());
        continue;
      }
    } else if (c.name && c.color && !c.system) {
      map.set(c.name, { uuid: c.uuid, name: c.name, color: c.color });
    }
  }

  return Array.from(map.values());
}
