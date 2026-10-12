import { UI_MESSAGES } from '../uiMessages';
import { toUserMessage } from './userFacingError';

/** 入室の失敗を利用者向けの文言にする。検証エラー（UserFacingError）はそのまま、それ以外は汎用の文言にする */
export function toEntryErrorMessage(error: unknown): string {
  return toUserMessage(error, UI_MESSAGES.entryFailed);
}
