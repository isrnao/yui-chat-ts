import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatLogPage from './ChatLogPage';
import type { Chat } from '@features/chat/types';

const { mockChat, makeFulfilledPromise, makeRejectedPromise } = vi.hoisted(() => ({
  mockChat: {
    uuid: 'chat-1',
    room_id: 'superbeginner',
    name: 'user',
    color: '#000000',
    message: 'hello',
    time: 1,
    ip_masked: '',
    ua: '',
  } as Chat,
  // React 19 use() は jsdom+vitest 環境で未タグの pending promise を解決できないため、
  // 手動で status: 'fulfilled' を付けて same-tick 解決にする。
  // 本番では React 内部が自動でタグ付けする (test infra のみの workaround)。
  makeFulfilledPromise: <T,>(value: T): Promise<T> => {
    const p = Promise.resolve(value) as Promise<T> & { status?: string; value?: T };
    p.status = 'fulfilled';
    p.value = value;
    return p;
  },
  makeRejectedPromise: <T,>(reason: Error): Promise<T> => {
    const p = Promise.reject(reason) as Promise<T> & { status?: string; reason?: Error };
    // 未処理 rejection の警告を出さないためのダミーハンドラ（元の promise は reject のまま）
    p.catch(() => {});
    p.status = 'rejected';
    p.reason = reason;
    return p;
  },
}));

// Mock ChatLogList to avoid complex Supabase integration
vi.mock('@features/chat/components/ChatLogList', () => ({
  default: ({ chatLog, windowRows }: { chatLog: Chat[]; windowRows: number }) => (
    <div data-testid="chat-log-list">
      ChatLogLength: {chatLog.length}, WindowRows: {windowRows}
    </div>
  ),
}));

// usePreloadChatLogs (Suspense リソース) を pre-tagged promise を返す形でモック化。
// fetchInitialChatLogPage は ChatLogPage が React.use() で読み出す本体。
vi.mock('@features/chat/hooks/usePreloadChatLogs', () => ({
  usePreloadChatLogs: vi.fn(() => makeFulfilledPromise([mockChat])),
  fetchInitialChatLogPage: vi.fn(() => makeFulfilledPromise({ data: [mockChat], hasMore: false })),
}));

// 「もっと読み込む」用に chatApi も最低限モック
vi.mock('@features/chat/api/chatApi', () => ({
  loadChatLogs: vi.fn().mockResolvedValue([mockChat]),
  loadInitialChatLogs: vi.fn().mockResolvedValue([mockChat]),
  loadChatLogsWithPaging: vi.fn().mockResolvedValue({ data: [mockChat], hasMore: false }),
  getCacheInfo: vi.fn().mockReturnValue({ cached: false }),
}));

describe('ChatLogPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders component without crashing', () => {
    render(<ChatLogPage />);
    // pre-tagged 'fulfilled' promise なので Suspense fallback は出ず、同期で本体描画
    expect(screen.getByTestId('chat-log-list')).toBeInTheDocument();
    expect(screen.getByText(/ChatLogLength: 1/)).toBeInTheDocument();
  });

  // 取得失敗を空配列へ変換していた頃は「エラー」と「発言 0 件」が区別できず、
  // ErrorBoundary も機能していなかった
  test('取得に失敗したらエラー表示と再読込ボタンを出す', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fetchInitialChatLogPage } = await import('@features/chat/hooks/usePreloadChatLogs');
    vi.mocked(fetchInitialChatLogPage).mockReturnValue(
      makeRejectedPromise(new Error('network down'))
    );

    render(<ChatLogPage />);

    expect(screen.getByText('チャットログの読み込みに失敗しました。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument();
    expect(screen.queryByTestId('chat-log-list')).not.toBeInTheDocument();

    consoleError.mockRestore();
  });
});
