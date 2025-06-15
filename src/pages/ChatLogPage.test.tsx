import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatLogPage from './ChatLogPage';
import type { Chat } from '@features/chat/types';

const STORAGE_KEY = 'yui_chat_dat';

// Mock ChatLogList.lazy to avoid loading real implementation
vi.mock('@features/chat/components/ChatLogList.lazy', () => ({
  default: ({ chatLog, windowRows }: { chatLog: Chat[]; windowRows: number }) => (
    <div data-testid="chat-log-list">
      ChatLogLength: {chatLog.length}, WindowRows: {windowRows}
    </div>
  ),
}));

describe('ChatLogPage Component', () => {
  const mockChatLog: Chat[] = [{ id: '1', message: 'Hello' }];

  beforeEach(() => {
    localStorage.clear();
  });

  test('initially loads chat log from localStorage', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mockChatLog));

    render(<ChatLogPage />);

    await waitFor(() => {
      expect(screen.getByTestId('chat-log-list')).toHaveTextContent('ChatLogLength: 1');
    });
  });

  test('renders correct default windowRows value', () => {
    render(<ChatLogPage />);

    expect(screen.getByRole('combobox')).toHaveValue('50');
  });

  test('changes windowRows value on select change', () => {
    render(<ChatLogPage />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '100' } });

    expect(select).toHaveValue('100');
  });

  test('reloads chat log when reload button clicked', async () => {
    render(<ChatLogPage />);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(mockChatLog));

    fireEvent.click(screen.getByRole('button', { name: /再読込/i }));

    await waitFor(() => {
      expect(screen.getByTestId('chat-log-list')).toHaveTextContent('ChatLogLength: 1');
    });
  });

  test('handles invalid JSON gracefully', async () => {
    localStorage.setItem(STORAGE_KEY, 'invalid json');

    render(<ChatLogPage />);

    await waitFor(() => {
      expect(screen.getByTestId('chat-log-list')).toHaveTextContent('ChatLogLength: 0');
    });
  });
});
