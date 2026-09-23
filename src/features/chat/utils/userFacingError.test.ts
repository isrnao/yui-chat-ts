import { describe, it, expect } from 'vitest';
import { UserFacingError, toUserMessage } from './userFacingError';

describe('toUserMessage', () => {
  it('UserFacingError の文言はそのまま出す', () => {
    expect(toUserMessage(new UserFacingError('おなまえは24文字以内'), '失敗')).toBe(
      'おなまえは24文字以内'
    );
  });

  it('API などの内部エラーは汎用の文言に置き換える', () => {
    expect(toUserMessage(new Error('Failed to save chat: 500'), '送信できませんでした')).toBe(
      '送信できませんでした'
    );
    expect(toUserMessage(new Error('Failed to clear chat logs: boom'), '消せませんでした')).toBe(
      '消せませんでした'
    );
    expect(toUserMessage('boom', '失敗')).toBe('失敗');
  });
});
