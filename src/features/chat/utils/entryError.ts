import { toUserMessage } from './userFacingError';

/** 入室の失敗を利用者向けの文言にする。検証エラー（UserFacingError）はそのまま、それ以外は汎用の文言にする */
export function toEntryErrorMessage(error: unknown): string {
  return toUserMessage(error, '入室に失敗しました。時間をおいてもう一度お試しください。');
}
