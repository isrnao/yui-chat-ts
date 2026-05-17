import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ChatLogPage from './ChatLogPage';
import type { Chat } from '@features/chat/types';

const { mockChat } = vi.hoisted(() => ({
  mockChat: {
    uuid: 'chat-1',
    room_id: 'superbeginner',
    name: 'user',
    color: '#000000',
    message: 'hello',
    time: 1,
    ip: '',
    ua: '',
  } satisfies Chat,
}));

// Mock ChatLogList to avoid complex Supabase integration
vi.mock('@features/chat/components/ChatLogList', () => ({
  default: ({ chatLog, windowRows }: { chatLog: Chat[]; windowRows: number }) => (
    <div data-testid="chat-log-list">
      ChatLogLength: {chatLog.length}, WindowRows: {windowRows}
    </div>
  ),
}));

// Mock chatApi - Supabaseとの複雑な統合を回避
vi.mock('@features/chat/api/chatApi', () => ({
  loadChatLogs: vi.fn().mockResolvedValue([mockChat]),
  loadInitialChatLogs: vi.fn().mockResolvedValue([mockChat]),
  // ChatLogPage は loadChatLogsWithPaging の戻り値で初期表示を組み立てる
  loadChatLogsWithPaging: vi.fn().mockResolvedValue({ data: [mockChat], hasMore: false }),
  getCacheInfo: vi.fn().mockReturnValue({ cached: false }),
}));

describe('ChatLogPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders component without crashing', async () => {
    render(<ChatLogPage />);
    expect(screen.getByTestId('chat-log-list')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/ChatLogLength: 1/)).toBeInTheDocument();
    });
  });
});
