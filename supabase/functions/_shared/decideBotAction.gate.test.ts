import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { decideBotAction, type TriggerRecord, type BotConfig } from './decideBotAction.ts';

const now = 1_700_000_000_000;

const defaultConfig: BotConfig = {
  targetRoom: 'superbeginner',
  greetings: ['こんにちは'],
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

function normalRecord(): TriggerRecord {
  return {
    uuid: 'test',
    room_id: 'superbeginner',
    name: 'alice',
    color: '#ffffff',
    message: 'こんにちは',
    time: now - 1000,
    metadata: { kind: 'normal' },
  };
}

// Feature: chat-llm-bot, Property 4: 実ユーザー在室ゲート
// 実ユーザー0人の直近ログでは greet も respond も返さない (R3.6, R5.1, R6.1, R6.3)
describe('Property 4: 実ユーザー在室ゲート', () => {
  it('空の直近ログでは no-real-user を返す', () => {
    const action = decideBotAction(normalRecord(), [], defaultConfig, now);
    expect(action.type).toBe('ignore');
    expect((action as { type: 'ignore'; reason: string }).reason).toBe('no-real-user');
  });

  it('Bot 発言のみのログでは no-real-user を返す', () => {
    const botOnly = [{
      uuid: 'bot-msg',
      name: 'ゆいボット',
      color: '#9b59b6',
      message: 'こんにちは',
      time: now - 1000,
      metadata: { kind: 'bot' as const },
    }];
    const action = decideBotAction(normalRecord(), botOnly, defaultConfig, now);
    expect(action.type).toBe('ignore');
    expect((action as { type: 'ignore'; reason: string }).reason).toBe('no-real-user');
  });

  it('任意の「実ユーザー0人ログ」で greet/respond を返さない (PBT)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            uuid: fc.string({ minLength: 1 }),
            name: fc.string({ minLength: 1, maxLength: 10 }),
            color: fc.string(),
            message: fc.string(),
            time: fc.integer({ min: now - 5 * 60 * 1000, max: now }),
          }),
        ),
        (botLogs) => {
          // Bot 発言のみのログ
          const logs = botLogs.map((l) => ({ ...l, metadata: { kind: 'bot' as const } }));
          const action = decideBotAction(normalRecord(), logs, defaultConfig, now);
          return action.type === 'ignore' && (action as { reason: string }).reason === 'no-real-user';
        },
      ),
      { numRuns: 100 },
    );
  });
});
