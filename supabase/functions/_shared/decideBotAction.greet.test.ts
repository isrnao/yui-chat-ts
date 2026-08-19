import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { decideBotAction, type TriggerRecord, type BotConfig } from './decideBotAction.ts';

const now = 1_700_000_000_000;
const WINDOW = 5 * 60 * 1000;

const defaultConfig: BotConfig = {
  targetRoom: 'superbeginner',
  greetings: ['こんにちは', 'よろしくね'],
  cooldownMinMs: 8000,
  cooldownMaxMs: 15000,
  responseDelayMinMs: 2000,
  responseDelayMaxMs: 6000,
  historyMessageCap: 20,
  botName: 'ゆいボット',
  botColor: '#9b59b6',
  model: 'gpt-4o-mini',
  temperature: 0.7,
  systemPrompt: 'テスト',
  webhookSecret: null,
  openaiApiKey: 'sk-test',
};

function userLog(name: string, timeOffset = 1000) {
  return {
    uuid: `u-${name}`,
    name,
    color: '#ffffff',
    message: 'hello',
    time: now - timeOffset,
  };
}

function triggerRecord(): TriggerRecord {
  return {
    uuid: 'trigger',
    room_id: 'superbeginner',
    name: 'alice',
    color: '#ffffff',
    message: 'こんにちは',
    time: now - 500,
    metadata: { kind: 'normal' },
  };
}

// Feature: chat-llm-bot, Property 5: 冪等な登場と挨拶の連続投稿
// Bot 発言が直近5分に無ければ greet、1件以上あれば greet を返さない (R2.1-2.6, R10.3)
describe('Property 5: 冪等な登場と挨拶の連続投稿', () => {
  it('直近5分に Bot 発言なし → greet を返し messages は greetings に一致する', () => {
    const logs = [userLog('alice')];
    const action = decideBotAction(triggerRecord(), logs, defaultConfig, now);
    expect(action.type).toBe('greet');
    if (action.type === 'greet') {
      expect(action.messages).toEqual(defaultConfig.greetings);
    }
  });

  it('直近5分に Bot 発言あり → greet を返さない(冪等性)', () => {
    const logs = [
      userLog('alice'),
      {
        uuid: 'bot-msg',
        name: 'ゆいボット',
        color: '#9b59b6',
        message: 'こんにちは',
        time: now - 1000,
        metadata: { kind: 'bot' as const },
      },
    ];
    const action = decideBotAction(triggerRecord(), logs, defaultConfig, now);
    expect(action.type).not.toBe('greet');
  });

  it('greet の messages は greetings と順序込みで一致する (R2.4)', () => {
    const configs = [
      { ...defaultConfig, greetings: ['hello'] },
      { ...defaultConfig, greetings: ['hi', 'how are you?', 'let\'s chat!'] },
    ];
    for (const config of configs) {
      const action = decideBotAction(triggerRecord(), [userLog('alice')], config, now);
      expect(action.type).toBe('greet');
      if (action.type === 'greet') {
        expect(action.messages).toEqual(config.greetings);
        expect(action.messages.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('登場判定は実ユーザー人数(1人 vs N人)に依存しない (R2.6, PBT)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (userCount) => {
          const manyUsers = Array.from({ length: userCount }, (_, i) => userLog(`user${i}`));
          const action = decideBotAction(triggerRecord(), manyUsers, defaultConfig, now);
          return action.type === 'greet';
        },
      ),
      { numRuns: 50 },
    );
  });

  it('5分を超えた Bot 発言は登場カウントに含まれない', () => {
    const oldBot = {
      uuid: 'old-bot',
      name: 'ゆいボット',
      color: '#9b59b6',
      message: 'こんにちは',
      time: now - WINDOW - 1000, // 5分超過
      metadata: { kind: 'bot' as const },
    };
    const logs = [userLog('alice'), oldBot];
    const action = decideBotAction(triggerRecord(), logs, defaultConfig, now);
    expect(action.type).toBe('greet');
  });
});
