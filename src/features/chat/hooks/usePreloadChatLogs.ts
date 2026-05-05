import { useEffect, useRef } from 'react';
import { loadInitialChatLogs } from '@features/chat/api/chatApi';
import type { RoomId } from '@features/chat/rooms';

/**
 * チャットログのプリロード用カスタムフック
 * ページ読み込み後すぐにバックグラウンドでデータを取得開始
 */
export function usePreloadChatLogs(roomId: RoomId) {
  const preloadPromiseRef = useRef<Promise<any> | null>(null);
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

/**
 * アプリケーション起動時の早期データ取得
 * プリフェッチの代わりに、認証付きで早期にデータを取得
 */
export async function earlyDataFetch(roomId: RoomId): Promise<void> {
  try {
    // 少量のデータを早期取得（認証付き）
    await loadInitialChatLogs(roomId, 50);
  } catch (error) {
    // エラーは静かに処理
  }
}

/**
 * 優先度の高いリソースのプリフェッチ
 */
export function preloadCriticalResources() {
  try {
    // DNS プリフェッチ
    const dnsLink = document.createElement('link');
    dnsLink.rel = 'dns-prefetch';
    dnsLink.href = 'https://tklxdjqlvwntdsfxfcwo.supabase.co';
    document.head.appendChild(dnsLink);

    // プリコネクト
    const preconnectLink = document.createElement('link');
    preconnectLink.rel = 'preconnect';
    preconnectLink.href = 'https://tklxdjqlvwntdsfxfcwo.supabase.co';
    preconnectLink.crossOrigin = 'anonymous';
    document.head.appendChild(preconnectLink);
  } catch (error) {
    // エラーは静かに処理
  }
}
