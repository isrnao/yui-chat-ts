/**
 * 入室の Session_Token（`v1.<作成時刻の Unix ミリ秒>.<32 バイトの乱数の base64url>`）を作る。
 * 入室要求を送る前にブラウザで作り、タブに保存してから送る（応答を受け取れなくても同じ試行を再送できる）。
 * サーバーはトークン全体の SHA-256 だけを保存する。spec: requirements.md Requirement 12.1
 *
 * 暗号論的な乱数が使えない環境では例外にする（呼び出し側は入室要求を送らない）。
 */
export function createEntryToken(now: number): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64url = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `v1.${now}.${base64url}`;
}
