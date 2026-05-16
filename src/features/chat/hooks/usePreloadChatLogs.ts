import { useEffect, useRef } from 'react';
import { loadInitialChatLogs } from '@features/chat/api/chatApi';
import type { Chat } from '@features/chat/types';
import type { RoomId } from '@features/chat/rooms';

/**
 * チャットログのプリロード用カスタムフック
 * ページ読み込み後すぐにバックグラウンドでデータを取得開始
 */
export function usePreloadChatLogs(roomId: RoomId) {
  const preloadPromiseRef = useRef<Promise<Chat[]> | null>(null);
  const previousRoomIdRef = useRef<RoomId | null>(null);

  useEffect(() => {
    if (previousRoomIdRef.current !== roomId) {
      preloadPromiseRef.current = null;
      previousRoomIdRef.current = roomId;
    }

    // コンポーネントマウント時に即座にプリロード開始
    if (!preloadPromiseRef.current) {
      preloadPromiseRef.current = loadInitialChatLogs(roomId, 100).catch(() => {
        return []; // フォールバック
      });
    }
  }, [roomId]);

  return preloadPromiseRef.current;
}
