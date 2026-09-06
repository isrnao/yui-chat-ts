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

function userLog(name = 'alice', timeOffset = 2000) {
  return {
    uuid: `u-${name}`,
    name,
    color: '#ffffff',
    message: 'hello',
    time: now - timeOffset,
  };
}

function botLog(timeOffset = 1000) {
  return {
    uuid: 'bot-msg',
    name: 'ゆいボット',
    color: '#9b59b6',
    message: 'こんにちは',
    time: now - timeOffset,
    metadata: { kind: 'bot' as const },
  };
}

function triggerRecord(): TriggerRecord {
  return {
    uuid: 'trigger',
    room_id: 'superbeginner',
    name: 'alice',
    color: '#ffffff',
    message: 'テスト発言',
    time: now - 100,
    metadata: { kind: 'normal' },
  };
}

// Feature: chat-llm-bot, Property 6: クールダウン不変条件と応答の集約
// now - lastBotTime < cooldown の窓内では respond を返さない (R8.1, R8.3, R8.4, R8.7)
describe('Property 6: クールダウン不変条件と応答の集約', () => {
  it('クールダウン窓内(最終Bot発言から 0ms)では respond を返さない', () => {
    // rng を固定(cooldown = cooldownMin = 8000ms、lastBotTime = now - 100)
    const logs = [userLog(), botLog(100)];
    const action = decideBotAction(triggerRecord(), logs, defaultConfig, now, () => 0);
    // now - (now - 100) = 100 < 8000 → cooldown
    expect(action.type).toBe('ignore');
  });

  it('クールダウン経過後(rng=0 → cooldown=cooldownMin)は respond を返す', () => {
    const elapsedMs = defaultConfig.cooldownMinMs + 1000;
    const logs = [userLog(), botLog(elapsedMs)];
    const action = decideBotAction(triggerRecord(), logs, defaultConfig, now, () => 0);
    expect(action.type).toBe('respond');
  });

  it('クールダウン窓内に複数発言が来ても respond は 0 回(集約 R8.4, PBT)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (msgCount) => {
          // 最終 Bot 発言が直近(クールダウン未経過)
          const logs = [
            ...Array.from({ length: msgCount }, (_, i) => userLog(`user${i}`, 5000 + i * 100)),
            botLog(100), // 直近の Bot 発言(経過 100ms)
          ];
          // rng=0 → cooldown = cooldownMin = 8000ms。100 < 8000 → ignore
          const action = decideBotAction(triggerRecord(), logs, defaultConfig, now, () => 0);
          return action.type === 'ignore';
        },
      ),
      { numRuns: 50 },
    );
  });

  it('クールダウンは直近ログの Bot 発言時刻のみから導出される(外部状態不要) R8.7', () => {
    const logs1 = [userLog(), botLog(9000)]; // 9000ms 経過
    const logs2 = [userLog(), botLog(9000)]; // 同じ入力
    const action1 = decideBotAction(triggerRecord(), logs1, defaultConfig, now, () => 0);
    const action2 = decideBotAction(triggerRecord(), logs2, defaultConfig, now, () => 0);
    expect(action1.type).toBe(action2.type);
  });
});
