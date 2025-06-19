import type { Chat } from '@features/chat/types';

// モックデータ（認証エラー時のフォールバック用）
export const mockChatData: Chat[] = [
  {
    id: 'mock-1',
    name: 'システム',
    color: '#2563eb',
    message: 'チャットシステムに接続中です...',
    time: Date.now(),
    client_time: Date.now(),
    optimistic: false, // モックデータは送信済み
    system: true,
    email: '',
    ip: '',
    ua: '',
  },
  {
    id: 'mock-2',
    name: 'ゆい',
    color: '#ec4899',
    message: 'こんにちは！チャットへようこそ✨',
    time: Date.now() - 60000,
    client_time: Date.now() - 60000,
    optimistic: false, // モックデータは送信済み
    system: false,
    email: '',
    ip: '',
    ua: '',
  },
  {
    id: 'mock-3',
    name: 'たろう',
    color: '#059669',
    message: 'よろしくお願いします！',
    time: Date.now() - 120000,
    client_time: Date.now() - 120000,
    optimistic: false, // モックデータは送信済み
    system: false,
    email: '',
    ip: '',
    ua: '',
  },
];

// オフライン状態の検出
export function isOnline(): boolean {
  return navigator.onLine;
}

// ネットワーク状態の監視
export function monitorNetworkStatus(): void {
  window.addEventListener('online', () => {
    // ネットワーク復旧時の処理
  });

  window.addEventListener('offline', () => {
    // ネットワーク切断時の処理
  });
}
