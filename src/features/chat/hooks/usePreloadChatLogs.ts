import { useEffect, useRef } from 'react';
import { loadInitialChatLogs } from '@features/chat/api/chatApi';

/**
 * チャットログのプリロード用カスタムフック
 * ページ読み込み後すぐにバックグラウンドでデータを取得開始
 */
export function usePreloadChatLogs() {
  const preloadPromiseRef = useRef<Promise<any> | null>(null);

  useEffect(() => {
    // コンポーネントマウント時に即座にプリロード開始
    if (!preloadPromiseRef.current) {
      preloadPromiseRef.current = loadInitialChatLogs(100).catch(() => {
        return []; // フォールバック
      });
    }
  }, []);

  return preloadPromiseRef.current;
}

/**
 * アプリケーション起動時の早期データ取得
 * プリフェッチの代わりに、認証付きで早期にデータを取得
 */
export async function earlyDataFetch(): Promise<void> {
  try {
    // 少量のデータを早期取得（認証付き）
    await loadInitialChatLogs(50);
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
