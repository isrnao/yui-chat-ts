import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getRecentParticipants, RECENT_WINDOW_MS, type ParticipantRow } from './participants';

const now = 1_700_000_000_000;
const recent = (offset = 0): number => now - offset;

function normalUser(name: string, color = '#ffffff'): ParticipantRow {
  return { uuid: `uuid-${name}`, name, color, message: 'hello', time: recent() };
}

function adminWelcome(name: string, userColor?: string): ParticipantRow {
  return {
    uuid: `uuid-welcome-${name}`,
    name: 'admin',
    color: '#000',
    message: `${name} さん、Welcome to superbeginner!`,
    time: recent(),
    metadata: { kind: 'admin', userColor },
  };
}

function adminExit(name: string): ParticipantRow {
  return {
    uuid: `uuid-exit-${name}`,
    name: 'admin',
    color: '#000',
    message: `${name}さん、またきておくれやすぅ`,
    time: recent(),
    metadata: { kind: 'admin' },
  };
}

function botMessage(name = 'ゆいボット'): ParticipantRow {
  return {
    uuid: 'uuid-bot',
    name,
    color: '#9b59b6',
    message: 'こんにちは',
    time: recent(),
    metadata: { kind: 'bot' },
  };
}

// Feature: chat-llm-bot, Property 10: 参加者判定ロジックの正しさ
describe('getRecentParticipants', () => {
  describe('時間窓', () => {
    it('5分以内の通常発言者は参加者に含まれる', () => {
      const logs: ParticipantRow[] = [normalUser('alice')];
      expect(getRecentParticipants(logs, now)).toHaveLength(1);
    });

    it('5分超過の発言者は参加者に含まれない (R5.3)', () => {
      const old: ParticipantRow = {
        ...normalUser('alice'),
        time: now - RECENT_WINDOW_MS - 1,
      };
      expect(getRecentParticipants([old], now)).toHaveLength(0);
    });

    it('5分ちょうど(境界)の発言者は含まれる', () => {
      const boundary: ParticipantRow = {
        ...normalUser('alice'),
        time: now - RECENT_WINDOW_MS,
      };
      expect(getRecentParticipants([boundary], now)).toHaveLength(1);
    });

    it('任意の now で5分超過の発言は結果に影響しない (PBT)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1_000_000 }),
          (nowOffset) => {
            const testNow = now + nowOffset;
            const oldLog: ParticipantRow = {
              ...normalUser('old-user'),
              time: testNow - RECENT_WINDOW_MS - 1000,
            };
            const result = getRecentParticipants([oldLog], testNow);
            return result.length === 0;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('入室追加 (R5.4)', () => {
    it('kind:admin の入室メッセージから参加者を追加する', () => {
      const result = getRecentParticipants([adminWelcome('alice', '#ff0000')], now);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('alice');
      expect(result[0].color).toBe('#ff0000');
    });

    it('userColor なしは #333333 をデフォルトで使用する', () => {
      const result = getRecentParticipants([adminWelcome('bob')], now);
      expect(result[0].color).toBe('#333333');
    });
  });

  describe('退室除外 (R5.5)', () => {
    it('入室後に退室メッセージが来た名前は除外される', () => {
      const logs: ParticipantRow[] = [
        { ...adminWelcome('alice'), time: recent(2000) },
        { ...adminExit('alice'), time: recent(1000) },
      ];
      expect(getRecentParticipants(logs, now)).toHaveLength(0);
    });

    it('退室後に再入室した場合は再追加される', () => {
      const logs: ParticipantRow[] = [
        { ...adminWelcome('alice'), time: recent(4000) },
        { ...adminExit('alice'), time: recent(3000) },
        { ...adminWelcome('alice'), time: recent(2000) },
      ];
      const result = getRecentParticipants(logs, now);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('alice');
    });
  });

  describe('Bot 非計上 (R5.6)', () => {
    it('kind:bot の発言者は実ユーザーとして計上されない', () => {
      const result = getRecentParticipants([botMessage()], now);
      expect(result).toHaveLength(0);
    });

    it('Bot 発言を追加しても実ユーザー集合は変化しない (PBT)', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 10 }),
              time: fc.integer({ min: now - RECENT_WINDOW_MS + 1000, max: now }),
            }),
          ),
          (users) => {
            const userLogs: ParticipantRow[] = users.map((u) => ({
              uuid: `u-${u.name}`,
              name: u.name,
              color: '#ffffff',
              message: 'hello',
              time: u.time,
            }));
            const withBot = [
              ...userLogs,
              { ...botMessage(), time: now - 1000 },
            ];
            const withoutBot = getRecentParticipants(userLogs, now);
            const withBotResult = getRecentParticipants(withBot, now);
            const withoutBotNames = new Set(withoutBot.map((p) => p.name));
            const withBotNames = new Set(withBotResult.map((p) => p.name));
            return (
              withoutBotNames.size === withBotNames.size &&
              [...withoutBotNames].every((n) => withBotNames.has(n))
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('通常発言', () => {
    it('system:true の発言は参加者に含まれない', () => {
      const sys: ParticipantRow = { ...normalUser('alice'), system: true };
      expect(getRecentParticipants([sys], now)).toHaveLength(0);
    });

    it('name が空の発言は参加者に含まれない', () => {
      const noName: ParticipantRow = { ...normalUser(''), uuid: 'uuid-noname' };
      expect(getRecentParticipants([noName], now)).toHaveLength(0);
    });
  });
});
