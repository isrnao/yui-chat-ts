/**
 * 書いた端末の鍵（author key、Issue #179）。端末（ブラウザ）ごとに 32 バイトの乱数を作って localStorage に持ち、
 * save-chat に x-chat-author-key で送る。サーバーは鍵の SHA-256 を発言と結び付けて保存し、clear（clear_my_chats）は
 * 同じ鍵で書いた発言だけを消す。
 *
 * - 鍵は base64url の 43 文字（サーバーの author_key_hash と同じ形）
 * - 鍵が無いときの「読む → 作る → 保存する」は Web Locks でタブ間に直列化する。同時に開いた 2 つのタブが
 *   別々の鍵を作って上書きし合うと、上書きされた側で書いた発言が後から消せなくなるため
 * - 毎回 localStorage から読む（別のタブが保存した鍵に追随する）
 * - localStorage が使えないとき（プライベートモードなど）は、このページを開いている間だけメモリに持つ
 * - ブラウザのデータを消した・別のブラウザで書いた発言は、消せなくなる（[消す] の説明に書いている）
 */
const STORAGE_KEY = 'yui-chat:author-key';
const LOCK_NAME = 'yui-chat:author-key';
const KEY_FORMAT = /^[A-Za-z0-9_-]{43}$/;

let memoryKey: string | null = null;

function generateKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function readStored(): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && KEY_FORMAT.test(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** 保存済みの鍵を返し、無ければ作って保存する（ロックの中で呼ぶ） */
function readOrCreate(): string {
  const stored = readStored();
  if (stored) return stored;
  const key = memoryKey ?? generateKey();
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // 保存できなければ、このページを開いている間だけ使う
  }
  // 保存できたかを読み直す（保存できなければメモリの鍵を使い続ける）
  memoryKey = readStored() ?? key;
  return memoryKey;
}

type LockManager = { request<T>(name: string, callback: () => Promise<T> | T): Promise<T> };

export async function getAuthorKey(): Promise<string> {
  const stored = readStored();
  if (stored) return stored;
  const locks = (globalThis.navigator as { locks?: LockManager } | undefined)?.locks;
  if (!locks) return readOrCreate();
  try {
    return await locks.request(LOCK_NAME, readOrCreate);
  } catch {
    return readOrCreate();
  }
}
