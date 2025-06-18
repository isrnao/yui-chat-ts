import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatLogPage from './ChatLogPage';
import type { Chat } from '@features/chat/types';

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
  loadChatLogs: vi.fn().mockResolvedValue([]),
}));

describe('ChatLogPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders component without crashing', () => {
    render(<ChatLogPage />);
    expect(screen.getByTestId('chat-log-list')).toBeInTheDocument();
  });
});
