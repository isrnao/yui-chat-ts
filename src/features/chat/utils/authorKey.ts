/**
 * 書いた端末の鍵（author key、Issue #179）。端末（ブラウザ）ごとに 32 バイトの乱数を作って localStorage に持ち、
 * save-chat に x-chat-author-key で送る。サーバーは鍵の SHA-256 を発言と結び付けて保存し、clear（clear_my_chats）は
 * 同じ鍵で書いた発言だけを消す。
 *
 * - 鍵は base64url の 43 文字（サーバーの author_key_hash と同じ形）
 * - localStorage が使えないとき（プライベートモードなど）は、このページを開いている間だけメモリに持つ
 * - ブラウザのデータを消した・別のブラウザで書いた発言は、消せなくなる（[消す] の説明に書いている）
 */
const STORAGE_KEY = 'yui-chat:author-key';
const KEY_FORMAT = /^[A-Za-z0-9_-]{43}$/;

let memoryKey: string | null = null;

function generateKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function getAuthorKey(): string {
  if (memoryKey) return memoryKey;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && KEY_FORMAT.test(stored)) return (memoryKey = stored);
  } catch {
    // 読めなければ新しく作る
  }
  memoryKey = generateKey();
  try {
    localStorage.setItem(STORAGE_KEY, memoryKey);
  } catch {
    // 保存できなければ、このページを開いている間だけ使う
  }
  return memoryKey;
}

/** テスト用: メモリの鍵を捨てる */
export function resetAuthorKeyForTest(): void {
  memoryKey = null;
}
