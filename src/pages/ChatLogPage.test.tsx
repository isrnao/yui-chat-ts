import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatLogPage from './ChatLogPage';
import type { Chat } from '@features/chat/types';

const { mockChat, makeFulfilledPromise } = vi.hoisted(() => ({
  mockChat: {
    uuid: 'chat-1',
    room_id: 'superbeginner',
    name: 'user',
    color: '#000000',
    message: 'hello',
    time: 1,
    ip: '',
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
});
