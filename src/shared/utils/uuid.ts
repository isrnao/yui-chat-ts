import { v7 as uuidv7, v4 as uuidv4 } from 'uuid';

/**
 * セキュアなUUID v7生成（レガシー用途）
 * プライバシー保護のため、小さなランダムオフセットを追加
 * 注意：Supabase側でUUID v7を生成する場合は使用不要
 */
export function generateSecureUUIDv7(): string {
  try {
    // 実際の時刻に最大30秒のランダムオフセットを追加
    // これにより正確な投稿時刻の推測を困難にする
    const offset = Math.random() * 30000; // 0-30秒のランダムオフセット
    const adjustedTime = Date.now() + offset;

    return uuidv7({ msecs: adjustedTime });
  } catch (error) {
    // UUID v7生成に失敗した場合はUUID v4にフォールバック
    console.warn('UUID v7 generation failed, falling back to v4:', error);
    return uuidv4();
  }
}

/**
 * 高性能チャット用のUUID生成（レガシー用途）
 * 注意：Supabase側でUUID v7を生成する場合は使用不要
 */
export function generateChatId(): string {
  return generateSecureUUIDv7();
}

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
 * UUIDから概算の生成時刻を取得（UUID v7のみ）
 * 注意：セキュリティ上のオフセットにより、正確な時刻ではない
 */
export function extractTimestampFromUUIDv7(id: string): number | null {
  if (!isUUIDv7(id)) {
    return null;
  }

  try {
    // UUID v7の最初の48ビットがタイムスタンプ
    const timestampHex = id.replace(/-/g, '').slice(0, 12);
    const timestamp = parseInt(timestampHex, 16);

    return timestamp;
  } catch (error) {
    console.warn('Failed to extract timestamp from UUID v7:', error);
    return null;
  }
}

/**
 * チャットメッセージの効率的なソート
 * UUID v7の特性を活用して高速化（Supabase側でUUID v7が主キーの場合に最適化）
 */
export function sortChatsByTime<T extends { uuid: string; time: number }>(chats: T[]): T[] {
  return chats.sort((a, b) => {
    // UUID v7がサーバー側で生成されている場合、UUIDソートが最も正確
    if (isUUIDv7(a.uuid) && isUUIDv7(b.uuid)) {
      return b.uuid.localeCompare(a.uuid); // 降順（新しいものが先）
    }

    // そうでなければ従来通りtimeフィールドで比較
    return b.time - a.time;
  });
}

/**
 * 指定時刻以降のチャットを検索するためのUUID v7下限値を生成
 * @param timestamp ミリ秒単位のタイムスタンプ
 * @returns 検索用のUUID v7下限値
 */
export function generateUUIDv7FromTimestamp(timestamp: number): string {
  try {
    return uuidv7({ msecs: timestamp });
  } catch (error) {
    console.warn('Failed to generate UUID v7 from timestamp:', error);
    // フォールバック：現在時刻でUUID v7を生成
    return uuidv7();
  }
}

/**
 * 指定時間範囲のチャットを効率的に検索するためのUUID v7範囲を生成
 * @param startTime 開始時刻（ミリ秒）
 * @param endTime 終了時刻（ミリ秒、省略時は現在時刻）
 * @returns {start: string, end: string} 検索範囲のUUID v7
 */
export function generateUUIDv7Range(
  startTime: number,
  endTime?: number
): { start: string; end: string } {
  const end = endTime || Date.now();
  return {
    start: generateUUIDv7FromTimestamp(startTime),
    end: generateUUIDv7FromTimestamp(end),
  };
}

/**
 * 開発環境用：UUID生成パフォーマンステスト
 */
export function benchmarkUUIDGeneration(iterations = 10000) {
  console.time('UUID v7 generation');
  for (let i = 0; i < iterations; i++) {
    generateSecureUUIDv7();
  }
  console.timeEnd('UUID v7 generation');

  console.time('UUID v4 generation');
  for (let i = 0; i < iterations; i++) {
    uuidv4();
  }
  console.timeEnd('UUID v4 generation');
}
