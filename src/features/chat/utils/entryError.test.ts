import { describe, it, expect } from 'vitest';
import { toEntryErrorMessage } from './entryError';
import { UserFacingError } from './userFacingError';

describe('toEntryErrorMessage', () => {
  it('検証エラーの文言はそのまま出す', () => {
    expect(toEntryErrorMessage(new UserFacingError('おなまえは24文字以内'))).toBe(
      'おなまえは24文字以内'
    );
  });

  it('保存の失敗（API の内部メッセージ）は汎用の文言にする', () => {
    expect(toEntryErrorMessage(new Error('Failed to save chat: 500'))).toBe(
      '入室に失敗しました。時間をおいてもう一度お試しください。'
    );
    expect(toEntryErrorMessage('boom')).toBe(
      '入室に失敗しました。時間をおいてもう一度お試しください。'
    );
  });
});
