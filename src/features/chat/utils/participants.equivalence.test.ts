import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { getRecentParticipants as srcImpl, RECENT_WINDOW_MS } from './participants';
import { getRecentParticipants as sharedImpl } from '../../../../supabase/functions/_shared/participants';

const VALID_KINDS = ['normal', 'fortune', 'admin', 'bot', undefined] as const;
const now = 1_700_000_000_000;

// Feature: chat-llm-bot, Property 10: 実装等価性
// src 版と _shared 版の getRecentParticipants が同一結果を返す (R5.7)
describe('getRecentParticipants 両実装等価性', () => {
  it('任意の入力で src 版と _shared 版が同一の参加者集合を返す (PBT)', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            uuid: fc.string({ minLength: 1, maxLength: 8 }),
            name: fc.string({ minLength: 0, maxLength: 10 }),
            color: fc.string({ minLength: 0, maxLength: 10 }),
            message: fc.oneof(
              fc.constant('こんにちは'),
              fc.string({ minLength: 0, maxLength: 20 }),
              fc.constantFrom(
                'alice さん、Welcome to superbeginner!',
                'aliceさん、またきておくれやすぅ',
                'bob さん、Welcome to beginner!',
              ),
            ),
            time: fc.integer({ min: now - RECENT_WINDOW_MS - 5000, max: now }),
            system: fc.option(fc.boolean(), { nil: undefined }),
            metadata: fc.option(
              fc.record({
                kind: fc.option(fc.constantFrom(...VALID_KINDS), { nil: undefined }),
                userColor: fc.option(fc.string(), { nil: undefined }),
              }),
              { nil: null },
            ),
          }),
          { maxLength: 20 },
        ),
        fc.integer({ min: now, max: now + 10000 }),
        (logs, testNow) => {
          const srcResult = srcImpl(logs, testNow);
          const sharedResult = sharedImpl(logs, testNow);

          const srcNames = new Set(srcResult.map((p) => p.name));
          const sharedNames = new Set(sharedResult.map((p) => p.name));

          if (srcNames.size !== sharedNames.size) return false;
          return [...srcNames].every((n) => sharedNames.has(n));
        },
      ),
      { numRuns: 100 },
    );
  });
});
