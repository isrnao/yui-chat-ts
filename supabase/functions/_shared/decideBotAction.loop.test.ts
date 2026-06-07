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
  systemPrompt: 'テスト用プロンプト',
  webhookSecret: null,
  openaiApiKey: 'sk-test',
};

// Feature: chat-llm-bot, Property 3: ループ防止の不変条件
// kind:'bot' の record は、ルーム・参加者・クールダウンの状態に関わらず
// 常に { type: 'ignore', reason: 'loop' } を返す (R4.1, R4.2, R11.3)
describe('Property 3: ループ防止の不変条件', () => {
  it('kind:bot の record には常に ignore(loop) を返す', () => {
    fc.assert(
      fc.property(
        fc.record({
          uuid: fc.string({ minLength: 1 }),
          room_id: fc.option(fc.string(), { nil: undefined }),
          name: fc.string(),
          color: fc.string(),
          message: fc.string(),
          time: fc.integer({ min: 0, max: now }),
          system: fc.option(fc.boolean(), { nil: undefined }),
        }),
        fc.array(
          fc.record({
            uuid: fc.string({ minLength: 1 }),
            name: fc.string({ minLength: 1, maxLength: 10 }),
            color: fc.string(),
            message: fc.string(),
            time: fc.integer({ min: now - 5 * 60 * 1000, max: now }),
          }),
        ),
        fc.record({
          cooldownMinMs: fc.integer({ min: 0, max: 30000 }),
          cooldownMaxMs: fc.integer({ min: 0, max: 30000 }),
        }),
        (recordBase, recentLogs, configOverride) => {
          const record: TriggerRecord = {
            ...recordBase,
            metadata: { kind: 'bot' },
          };
          const config = { ...defaultConfig, ...configOverride };
          const action = decideBotAction(record, recentLogs, config, now);
          return action.type === 'ignore' && action.reason === 'loop';
        },
      ),
      { numRuns: 100 },
    );
  });

  it('クライアントが僭称した kind:bot も同様にループ防止する (R11.3)', () => {
    const record: TriggerRecord = {
      uuid: 'spoofed',
      room_id: 'superbeginner',
      name: 'spoofer',
      color: '#fff',
      message: 'なりすまし',
      time: now - 1000,
      metadata: { kind: 'bot' },
    };
    const action = decideBotAction(record, [], defaultConfig, now);
    expect(action.type).toBe('ignore');
    expect((action as { type: 'ignore'; reason: string }).reason).toBe('loop');
  });
});
