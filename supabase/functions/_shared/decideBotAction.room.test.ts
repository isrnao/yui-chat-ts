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

function userLog() {
  return {
    uuid: 'u-alice',
    name: 'alice',
    color: '#ffffff',
    message: 'hello',
    time: now - 1000,
  };
}

// Feature: chat-llm-bot, Property 7: 対象ルームスコープの不変条件
// room_id !== 'superbeginner' は常に ignore('other-room') を返す (R3.4, R10.1, R10.2)
describe('Property 7: 対象ルームスコープの不変条件', () => {
  it('room_id が targetRoom でない場合 other-room を返す', () => {
    const record: TriggerRecord = {
      uuid: 'test',
      room_id: 'other-room',
      name: 'alice',
      color: '#fff',
      message: 'hello',
      time: now - 1000,
      metadata: { kind: 'normal' },
    };
    const action = decideBotAction(record, [userLog()], defaultConfig, now);
    expect(action.type).toBe('ignore');
    expect((action as { type: 'ignore'; reason: string }).reason).toBe('other-room');
  });

  it('room_id が undefined の場合 other-room を返す', () => {
    const record: TriggerRecord = {
      uuid: 'test',
      name: 'alice',
      color: '#fff',
      message: 'hello',
      time: now - 1000,
    };
    const action = decideBotAction(record, [userLog()], defaultConfig, now);
    expect(action.type).toBe('ignore');
    expect((action as { type: 'ignore'; reason: string }).reason).toBe('other-room');
  });

  it('任意の非対象ルームで常に other-room を返す (PBT)', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => s !== defaultConfig.targetRoom),
        fc.array(
          fc.record({
            uuid: fc.string({ minLength: 1 }),
            name: fc.string({ minLength: 1, maxLength: 10 }),
            color: fc.string(),
            message: fc.string(),
            time: fc.integer({ min: now - 5 * 60 * 1000, max: now }),
          }),
        ),
        (roomId, recentLogs) => {
          const record: TriggerRecord = {
            uuid: 'test',
            room_id: roomId,
            name: 'alice',
            color: '#fff',
            message: 'hello',
            time: now - 1000,
            metadata: { kind: 'normal' },
          };
          const action = decideBotAction(record, recentLogs, defaultConfig, now);
          return action.type === 'ignore' && (action as { reason: string }).reason === 'other-room';
        },
      ),
      { numRuns: 100 },
    );
  });
});
