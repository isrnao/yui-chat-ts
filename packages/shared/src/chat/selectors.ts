import type { Chat, Participant } from './types';

export type ChatRankingEntry = {
  name: string;
  count: number;
  lastTime: number;
};

export function getRecentParticipants(
  chatLog: Chat[],
  options: {
    now?: number;
    windowMs?: number;
  } = {},
): Participant[] {
  const { now = Date.now(), windowMs = 5 * 60 * 1000 } = options;
  const participants = new Map<string, Participant>();

  chatLog.forEach((chat) => {
    if (chat.system) return;
    if (!chat.name || !chat.color) return;
    if (now - chat.time > windowMs) return;

    if (!participants.has(chat.name)) {
      participants.set(chat.name, {
        uuid: chat.uuid,
        name: chat.name,
        color: chat.color,
      });
    }
  });

  return Array.from(participants.values());
}

export function getChatRanking(chatLog: Chat[]): ChatRankingEntry[] {
  const map = new Map<string, ChatRankingEntry>();

  chatLog.forEach((chat) => {
    if (chat.system || !chat.name) {
      return;
    }

    const entry = map.get(chat.name) ?? { name: chat.name, count: 0, lastTime: 0 };
    entry.count += 1;
    entry.lastTime = Math.max(entry.lastTime, chat.time);
    map.set(chat.name, entry);
  });

  return Array.from(map.values()).sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return b.lastTime - a.lastTime;
  });
}
