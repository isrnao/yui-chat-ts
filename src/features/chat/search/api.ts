import { supabase } from '@shared/supabaseClient';
import type { RoomId } from '../rooms';

export type ChatSearchItem = {
  uuid: string;
  roomId: RoomId;
  name: string;
  time: number;
  excerpt: string;
};
export type ChatSearchResponse = {
  elapsedMs: number;
  items: ChatSearchItem[];
  nextCursor: string | null;
};
export type SearchRequest =
  | { mode: 'search'; roomId: RoomId; q: string; rangeDays: 30 | 90; cursor?: string | null }
  | { mode: 'context'; roomId: RoomId; targetUuid: string };

export async function searchChats(
  body: SearchRequest,
  signal: AbortSignal
): Promise<ChatSearchResponse> {
  const start = performance.now();
  const { data, error } = await supabase.functions.invoke('search-chats', {
    body,
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  });
  if (error) {
    const status = error.context instanceof Response ? error.context.status : 0;
    const message =
      status === 429
        ? '少し待ってから検索してください。'
        : status === 400
          ? '検索条件を確認してください。各語2文字以上、合計80文字以内・5語までです。'
          : status === 404
            ? '発言が見つかりません。削除された可能性があります。'
            : '検索を一時停止しています。時間をおいてお試しください。';
    throw new Error(message);
  }
  // A malformed response is a failure, never a successful empty result.
  if (
    !data ||
    !Array.isArray(data.items) ||
    data.items.length > 50 ||
    (data.nextCursor !== null && typeof data.nextCursor !== 'string') ||
    data.items.some(
      (item: Partial<ChatSearchItem> | null) =>
        !item ||
        typeof item.uuid !== 'string' ||
        item.roomId !== body.roomId ||
        typeof item.name !== 'string' ||
        typeof item.excerpt !== 'string' ||
        typeof item.time !== 'number' ||
        !Number.isFinite(item.time) ||
        Math.abs(item.time) > 8_640_000_000_000_000
    )
  ) {
    throw new Error('検索結果を取得できませんでした。');
  }
  // Explicit DTO prevents unexpected response columns propagating into view state.
  return {
    items: data.items.map((item: ChatSearchItem) => ({
      uuid: item.uuid,
      roomId: item.roomId,
      name: item.name,
      time: item.time,
      excerpt: item.excerpt,
    })),
    nextCursor: data.nextCursor,
    elapsedMs: performance.now() - start,
  };
}
