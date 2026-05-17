import { useMemo } from 'react';
import { loadInitialChatLogs } from '@features/chat/api/chatApi';
import type { Chat } from '@features/chat/types';
import type { RoomId } from '@features/chat/rooms';

/**
 * チャットログのプリロード用カスタムフック
 * ページ読み込み後すぐにバックグラウンドでデータを取得開始
 *
 * roomId 単位で promise をメモ化することで、最初の render から呼び出し側に
 * 進行中の promise を返せる（旧実装の useEffect 版は最初の render で null を返していた）。
 * useMemo は保証ではなく最適化なので、StrictMode の二重マウント時には 2 回 fetch する可能性があるが、
 * .catch でフォールバック済みのプリフェッチ最適化のため許容する。
 */
export function usePreloadChatLogs(roomId: RoomId): Promise<Chat[]> {
  return useMemo(() => loadInitialChatLogs(roomId, 100).catch(() => [] as Chat[]), [roomId]);
}
