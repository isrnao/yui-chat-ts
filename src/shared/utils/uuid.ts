// UUID のユーティリティ。発言の UUID（v7）はサーバーが振るので、クライアントは判定と並べ替えだけを行う。

/**
 * UUID v7かどうかを判定
 */
export function isUUIDv7(id: string): boolean {
  if (typeof id !== 'string' || id.length !== 36) {
    return false;
  }

  // UUID v7のバージョン番号は '7'
  return id.charAt(14) === '7';
}

/**
 * チャットメッセージの効率的なソート
 * UUID v7の特性を活用して高速化（Supabase側でUUID v7が主キーの場合に最適化）
 */
export function sortChatsByTime<T extends { uuid: string; time: number }>(chats: T[]): T[] {
  return [...chats].sort((a, b) => {
    // UUID v7がサーバー側で生成されている場合、UUIDソートが最も正確
    if (isUUIDv7(a.uuid) && isUUIDv7(b.uuid)) {
      return b.uuid.localeCompare(a.uuid); // 降順（新しいものが先）
    }

    // そうでなければ従来通りtimeフィールドで比較
    return b.time - a.time;
  });
}

/** crypto.randomUUID が使えない環境（安全でないコンテキストなど）向けの UUID v4 */
function randomUUIDv4Fallback(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 送信操作 1 件の ID（UUID v4）。save-chat の x-chat-operation-id と、Browser の send-chat で共有する。
 * crypto.randomUUID は安全なコンテキスト（https / localhost）でしか使えないので、代替を持つ。
 */
export function generateOperationId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : randomUUIDv4Fallback();
}
