import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildHistory } from './buildHistory.ts';
import { RECENT_WINDOW_MS } from './participants.ts';

const now = 1_700_000_000_000;

function userLog(name = 'alice', offset = 1000) {
  return { uuid: `u-${name}`, name, color: '#fff', message: `hi from ${name}`, time: now - offset };
}

function botLog(offset = 500) {
  return {
    uuid: 'bot',
    name: 'ゆいボット',
    color: '#9b59b6',
    message: 'こんにちは',
    time: now - offset,
    metadata: { kind: 'bot' as const },
  };
}

// Feature: chat-llm-bot, Property 8: 履歴トークン上限の不変条件
// buildHistory(logs, cap, now).length <= cap、cap===0 で空配列 (R3.8, R8.5, R8.6)
describe('Property 8: 履歴トークン上限の不変条件', () => {
  it('cap=0 の場合は空配列を返す (R8.6)', () => {
    const logs = [userLog(), botLog()];
    expect(buildHistory(logs, 0, now)).toEqual([]);
  });

  it('任意の cap >= 0 で history.length <= cap (PBT)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.array(
          fc.record({
            uuid: fc.string({ minLength: 1 }),
            name: fc.string({ minLength: 1, maxLength: 10 }),
            color: fc.string(),
            message: fc.string({ minLength: 0, maxLength: 50 }),
            time: fc.integer({ min: now - RECENT_WINDOW_MS + 1000, max: now }),
          }),
          { maxLength: 50 },
        ),
        (cap, logs) => {
          const history = buildHistory(logs, cap, now);
          return history.length <= cap;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Bot 発言は assistant ロールにマップされる', () => {
    const history = buildHistory([botLog()], 5, now);
    expect(history[0]?.role).toBe('assistant');
  });

  it('通常ユーザー発言は user ロールにマップされる', () => {
    const history = buildHistory([userLog()], 5, now);
    expect(history[0]?.role).toBe('user');
  });

  it('5分超過の発言は履歴に含まれない', () => {
    const oldLog = { ...userLog('old'), time: now - RECENT_WINDOW_MS - 1000 };
    const history = buildHistory([oldLog], 10, now);
    expect(history).toHaveLength(0);
  });

  it('system/admin/fortune の発言は履歴に含まれない', () => {
    const adminLog = {
      uuid: 'admin-msg',
      name: 'admin',
      color: '#000',
      message: 'alice さん、Welcome to superbeginner!',
      time: now - 1000,
      metadata: { kind: 'admin' as const },
    };
    const history = buildHistory([adminLog], 10, now);
    expect(history).toHaveLength(0);
  });

  it('cap より多いログは最新の cap 件に絞られる', () => {
    const logs = Array.from({ length: 10 }, (_, i) => userLog(`user${i}`, (10 - i) * 1000));
    const history = buildHistory(logs, 3, now);
    expect(history).toHaveLength(3);
  });
});
