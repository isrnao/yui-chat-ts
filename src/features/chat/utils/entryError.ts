import { UI_MESSAGES } from '../uiMessages';
import { toUserMessage } from './userFacingError';

/** 入室の要求が、あとから始まった入室・退室に追い越された。利用者に見せる失敗ではない */
export class SupersededSessionError extends Error {
  constructor() {
    super('Session request superseded');
    this.name = 'SupersededSessionError';
  }
}

/**
 * 入室の失敗を利用者向けの文言にする。検証エラー（UserFacingError）はそのまま、それ以外は汎用の文言にする。
 * 追い越された入室（SupersededSessionError）は失敗として見せないので空にする
 */
export function toEntryErrorMessage(error: unknown): string {
  if (error instanceof SupersededSessionError) return '';
  return toUserMessage(error, UI_MESSAGES.entryFailed);
}
