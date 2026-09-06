import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { decideBotAction, type TriggerRecord, type BotConfig } from './decideBotAction.ts';

const now = 1_700_000_000_000;

function makeConfig(overrides: Partial<BotConfig> = {}): BotConfig {
  return {
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
    ...overrides,
  };
}

function recentBotLog(timeOffset: number) {
  return {
    uuid: 'bot-msg',
    name: 'ゆいボット',
    color: '#9b59b6',
    message: 'こんにちは',
    time: now - timeOffset,
    metadata: { kind: 'bot' as const },
  };
}

function userLog(name = 'alice', timeOffset = 2000) {
  return {
    uuid: `u-${name}`,
    name,
    color: '#ffffff',
    message: 'hello',
    time: now - timeOffset,
  };
}

function triggerRecord(name = 'alice'): TriggerRecord {
  return {
    uuid: 'trigger',
    room_id: 'superbeginner',
    name,
    color: '#ffffff',
    message: '返して',
    time: now - 100,
    metadata: { kind: 'normal' },
  };
}

// Feature: chat-llm-bot, Property 9: 応答ゲートと人数非依存の単調性
// 全条件成立時に { type: 'respond', responseDelayMs, history } を返す (R3.7, R5.1, R5.2, R8.2, R10.3)
describe('Property 9: 応答ゲートと人数非依存の単調性', () => {
  it('全条件成立(クールダウン経過・通常発言)で respond を返す', () => {
    const config = makeConfig();
    // rng=0 → cooldown = cooldownMinMs = 8000ms。Bot 発言 9000ms 前 → 経過
    const logs = [userLog(), recentBotLog(9000)];
    const action = decideBotAction(triggerRecord(), logs, config, now, () => 0);
    expect(action.type).toBe('respond');
  });

  it('responseDelayMs は [min, max] 範囲内 (R8.2)', () => {
    const config = makeConfig();
    const logs = [userLog(), recentBotLog(20000)];
    // 複数の rng 値でテスト
    for (let r = 0; r <= 1; r += 0.1) {
      const action = decideBotAction(triggerRecord(), logs, config, now, () => r);
      if (action.type === 'respond') {
        expect(action.responseDelayMs).toBeGreaterThanOrEqual(config.responseDelayMinMs);
        expect(action.responseDelayMs).toBeLessThanOrEqual(config.responseDelayMaxMs);
      }
    }
  });

  it('respond の responseDelayMs は rng から決定される (PBT)', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1, noNaN: true }),
        (rngVal) => {
          const config = makeConfig();
          const logs = [userLog(), recentBotLog(20000)];
          const action = decideBotAction(triggerRecord(), logs, config, now, () => rngVal);
          if (action.type !== 'respond') return true;
          return (
            action.responseDelayMs >= config.responseDelayMinMs &&
            action.responseDelayMs <= config.responseDelayMaxMs
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('実ユーザー数を N>=1 に増やしても respond の判定は変化しない (R5.2, PBT)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (userCount) => {
          const config = makeConfig();
          const userLogs = Array.from({ length: userCount }, (_, i) => userLog(`user${i}`, 5000 + i * 100));
          const logs = [...userLogs, recentBotLog(20000)];
          const action = decideBotAction(triggerRecord(), logs, config, now, () => 0);
          return action.type === 'respond';
        },
      ),
      { numRuns: 50 },
    );
  });

  it('system 発言には respond しない (R3.5)', () => {
    const logs = [userLog(), recentBotLog(20000)];
    const sysRecord: TriggerRecord = {
      ...triggerRecord(),
      system: true,
    };
    const action = decideBotAction(sysRecord, logs, makeConfig(), now, () => 0);
    expect(action.type).toBe('ignore');
  });

  it('kind:admin の発言には respond しない (R3.5)', () => {
    const logs = [userLog(), recentBotLog(20000)];
    const adminRecord: TriggerRecord = {
      ...triggerRecord(),
      metadata: { kind: 'admin' },
    };
    const action = decideBotAction(adminRecord, logs, makeConfig(), now, () => 0);
    expect(action.type).toBe('ignore');
  });

  it('kind:fortune の発言には respond しない (R3.5)', () => {
    const logs = [userLog(), recentBotLog(20000)];
    const fortuneRecord: TriggerRecord = {
      ...triggerRecord(),
      metadata: { kind: 'fortune' },
    };
    const action = decideBotAction(fortuneRecord, logs, makeConfig(), now, () => 0);
    expect(action.type).toBe('ignore');
  });
});
