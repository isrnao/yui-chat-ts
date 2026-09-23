/**
 * 利用者に見せてよい文言を持つエラー（入力の検証や「削除対象の発言がありません」など）。
 *
 * API や Edge Function のエラー（`Failed to save chat: ...` など）はこれに包まず、画面では
 * 操作ごとの汎用の文言に置き換える。内部のメッセージをそのまま出すと、実装の詳細が漏れるうえ、
 * 利用者には意味が分からないため。
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

/** 利用者向けに表示する文言。UserFacingError ならその文言、それ以外は fallback */
export function toUserMessage(error: unknown, fallback: string): string {
  return error instanceof UserFacingError && error.message ? error.message : fallback;
}
