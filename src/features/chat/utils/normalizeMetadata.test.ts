import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { normalizeChatMetadata, normalizeChat } from './normalizeMetadata';

const VALID_KINDS = ['normal', 'fortune', 'admin', 'bot'] as const;

describe('normalizeChatMetadata', () => {
  describe('基本的な正規化', () => {
    it('version:1 以外は undefined を返す', () => {
      expect(normalizeChatMetadata({ version: 2 })).toBeUndefined();
      expect(normalizeChatMetadata({ version: 0 })).toBeUndefined();
      expect(normalizeChatMetadata(null)).toBeUndefined();
    });

    it('有効な kind を保持する', () => {
      for (const kind of VALID_KINDS) {
        const result = normalizeChatMetadata({ version: 1, kind });
        expect(result?.kind).toBe(kind);
      }
    });
  });

  // Feature: chat-llm-bot, Property 1: Bot 種別ラベルの正規化保持
  // kind:'bot' を含む行は正規化後も kind === 'bot' を保持する (R1.2, R1.4)
  describe('Property 1: Bot 種別ラベルの正規化保持', () => {
    it('kind:bot は正規化後も保持される', () => {
      const result = normalizeChatMetadata({ version: 1, kind: 'bot' });
      expect(result?.kind).toBe('bot');
    });

    it('任意の他フィールドと組み合わせても kind:bot を保持する', () => {
      fc.assert(
        fc.property(
          fc.record({
            fontColor: fc.option(fc.constantFrom('red', 'blue', 'green'), { nil: undefined }),
            bold: fc.option(fc.boolean(), { nil: undefined }),
            userColor: fc.option(fc.string(), { nil: undefined }),
          }),
          (extra) => {
            const input = { version: 1, kind: 'bot', ...extra };
            const result = normalizeChatMetadata(input);
            return result?.kind === 'bot';
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // Feature: chat-llm-bot, Property 2: 未知の種別ラベルの破棄
  // 許可リスト外の kind は undefined になる (R1.3)
  describe('Property 2: 未知の種別ラベルの破棄', () => {
    it('許可リスト外の kind は undefined になる', () => {
      fc.assert(
        fc.property(
          fc.string().filter((s) => !VALID_KINDS.includes(s as (typeof VALID_KINDS)[number])),
          (unknownKind) => {
            const result = normalizeChatMetadata({ version: 1, kind: unknownKind });
            return result?.kind === undefined;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('空文字の kind は undefined になる', () => {
      const result = normalizeChatMetadata({ version: 1, kind: '' });
      expect(result?.kind).toBeUndefined();
    });

    it('数値の kind は undefined になる', () => {
      const result = normalizeChatMetadata({ version: 1, kind: 42 });
      expect(result?.kind).toBeUndefined();
    });
  });
});

describe('normalizeChat', () => {
  it('kind:bot の行を Realtime 受信した場合も kind を保持する (R1.4)', () => {
    const row = {
      uuid: 'test-uuid',
      room_id: 'superbeginner',
      name: 'ゆいボット',
      color: '#9b59b6',
      message: 'こんにちは',
      time: Date.now(),
      ip: '',
      ua: 'bot-respond',
      metadata: { version: 1, kind: 'bot' },
    };
    const result = normalizeChat(row);
    expect(result.metadata?.kind).toBe('bot');
  });
});
