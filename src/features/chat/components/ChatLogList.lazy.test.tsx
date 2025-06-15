import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ChatLogList from './ChatLogList.lazy';
import type { Chat, Participant } from '@features/chat/types';

vi.mock('@shared/utils/format', () => ({
  formatTime: (t: number) => `TIME(${t})`,
}));

describe('ChatLogList', () => {
  const chatLog: Chat[] = [
    { id: '1', name: 'Taro', color: '#f00', message: 'Hello', time: 1000, email: '' },
    { id: '2', name: 'Jiro', color: '#0f0', message: 'World', time: 2000, email: 'jiro@mail.com' },
  ];
  const participants: Participant[] = [
    { id: 'p1', name: 'Alice', color: '#111' },
    { id: 'p2', name: 'Bob', color: '#222' },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1680000000000);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders no message when chatLog is empty', () => {
    render(<ChatLogList chatLog={[]} windowRows={10} participants={[]} />);
    expect(screen.getByText('まだ発言はありません。')).toBeInTheDocument();
    expect(screen.getByText('参加者:')).toBeInTheDocument();
    expect(screen.getByText('（なし）')).toBeInTheDocument();
  });

  it('renders participants', () => {
    render(<ChatLogList chatLog={[]} windowRows={10} participants={participants} />);
    expect(screen.getByText('Alice')).toHaveStyle({ color: '#111' });
    expect(screen.getByText('Bob')).toHaveStyle({ color: '#222' });
  });

  it('renders chat messages in time-desc order and sliced by windowRows', () => {
    // windowRows=2 で両方表示
    const { unmount } = render(<ChatLogList chatLog={chatLog} windowRows={2} participants={[]} />);
    expect(screen.getAllByText('Jiro')).toHaveLength(1);
    expect(screen.getAllByText('Taro')).toHaveLength(1);
    unmount();

    // windowRows=1 で Jiro だけ
    render(<ChatLogList chatLog={chatLog} windowRows={1} participants={[]} />);
    // 1個だけ（Taroは消えてるはず）
    expect(screen.getAllByText('Jiro')).toHaveLength(1);
    expect(screen.queryByText('Taro')).not.toBeInTheDocument();
  });

  it('shows mailto link if email is present', () => {
    render(<ChatLogList chatLog={chatLog} windowRows={2} participants={[]} />);
    const mailLink = screen.getByRole('link', { name: '>' });
    expect(mailLink).toHaveAttribute('href', 'mailto:jiro@mail.com');
    expect(mailLink).toHaveAttribute('target', '_blank');
  });

  it('shows > with no mailto if no email', () => {
    render(<ChatLogList chatLog={chatLog} windowRows={2} participants={[]} />);
    const allGt = screen.getAllByText('>');
    expect(allGt.length).toBe(2); // mailtoあり・なし両方
  });

  it('shows formatted time in header and messages', () => {
    const { container } = render(
      <ChatLogList chatLog={chatLog} windowRows={2} participants={[]} />
    );
    // headerの時刻（slice(0,5)に注意）
    const header = container.querySelector('span.text-xs.text-gray-500');
    expect(header?.textContent?.replace(/\s+/g, '')).toBe('[TIME(]');
    // 各チャットの時刻
    expect(screen.getByText('(TIME(2000))')).toBeInTheDocument();
    expect(screen.getByText('(TIME(1000))')).toBeInTheDocument();
  });
});
