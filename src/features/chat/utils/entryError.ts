/** 入室の失敗を利用者向けの文言にする。検証エラーはそのまま、それ以外は汎用の文言にする */
export function toEntryErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message && !error.message.startsWith('Failed to')) {
    return error.message;
  }
  return '入室に失敗しました。時間をおいてもう一度お試しください。';
}
