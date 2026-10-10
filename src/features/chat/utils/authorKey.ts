/**
 * 書いた端末の鍵（author key、Issue #179）。端末（ブラウザ）ごとに 32 バイトの乱数を作って localStorage に持ち、
 * save-chat に x-chat-author-key で送る。サーバーは鍵の SHA-256 を発言と結び付けて保存し、clear（clear_my_chats）は
 * 同じ鍵で書いた発言だけを消す。
 *
 * - 鍵は base64url の 43 文字（形の確かめはサーバーの author_key_hash が行う）
 * - 毎回 localStorage から読む（別のタブが先に保存した鍵に追随する）。初回に 2 つのタブが同時に鍵を作ると、
 *   後から保存した方の鍵が残り、もう片方のタブがその間に書いた発言は clear で消せなくなる。起きても損失は小さい
 *   ので、タブ間の直列化はしない
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
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && KEY_FORMAT.test(stored)) return stored;
  } catch {
    // 読めなければメモリの鍵を使う
  }
  memoryKey ??= generateKey();
  try {
    localStorage.setItem(STORAGE_KEY, memoryKey);
  } catch {
    // 保存できなければ、このページを開いている間だけ使う
  }
  return memoryKey;
}
