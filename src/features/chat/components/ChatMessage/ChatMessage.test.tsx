import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatMessage from './index';
import type { Chat } from '@features/chat/types';

vi.mock('@shared/utils/format', () => ({
  formatTime: (t: number) => `TIME(${t})`,
}));

describe('ChatMessage', () => {
  const chatWithEmail: Chat = {
    id: '1',
    name: 'Alice',
    color: '#ff0000',
    message: 'Hello World',
    time: 1680000000000,
    email: 'alice@example.com',
    ip: '192.168.1.1',
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };

  const chatWithoutEmail: Chat = {
    id: '2',
    name: 'Bob',
    color: '#00ff00',
    message: 'Hi there',
    time: 1680000000000,
    email: '',
    ip: '192.168.1.2',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  };

  it('renders chat message with email link', () => {
    render(<ChatMessage chat={chatWithEmail} />);

    expect(screen.getByText('Alice')).toHaveStyle({ color: '#ff0000' });
    expect(screen.getByText('Hello World')).toBeInTheDocument();
    expect(screen.getByText('(TIME(1680000000000))')).toBeInTheDocument();

    const emailLink = screen.getByRole('link', { name: '>' });
    expect(emailLink).toHaveAttribute('href', 'mailto:alice@example.com');
    expect(emailLink).toHaveAttribute('target', '_blank');
  });

  it('renders chat message without email link', () => {
    render(<ChatMessage chat={chatWithoutEmail} />);

    expect(screen.getByText('Bob')).toHaveStyle({ color: '#00ff00' });
    expect(screen.getByText('Hi there')).toBeInTheDocument();
    expect(screen.getByText('(TIME(1680000000000))')).toBeInTheDocument();

    // Should have a span with '>' instead of a link
    const gtSymbol = screen.getByText('>', { selector: 'span' });
    expect(gtSymbol).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders optimistic chat message with "送信中..." status', () => {
    const optimisticChat: Chat = {
      id: '3',
      name: 'Charlie',
      color: '#0000ff',
      message: 'Sending...',
      time: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year in future
      client_time: Date.now(),
      optimistic: true,
      ip: '192.168.1.3',
      ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
    };

    render(<ChatMessage chat={optimisticChat} />);

    expect(screen.getByText('Charlie')).toHaveStyle({ color: '#0000ff' });
    expect(screen.getByText('Sending...')).toBeInTheDocument();

    // Should show "送信中..." instead of formatted time
    expect(screen.getByText('(送信中...)')).toBeInTheDocument();

    // Should have gray color and pulse animation for optimistic status
    const timeElement = screen.getByText('(送信中...)');
    expect(timeElement).toHaveClass('text-gray-400');
    expect(timeElement).toHaveClass('animate-pulse');
  });

  it('renders regular chat message with formatted time', () => {
    const regularChat: Chat = {
      id: '4',
      name: 'David',
      color: '#ff00ff',
      message: 'Regular message',
      time: 1680000000000,
      optimistic: false,
      ip: '192.168.1.4',
      ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
    };

    render(<ChatMessage chat={regularChat} />);

    expect(screen.getByText('David')).toHaveStyle({ color: '#ff00ff' });
    expect(screen.getByText('Regular message')).toBeInTheDocument();

    // Should show formatted time for regular messages
    expect(screen.getByText('(TIME(1680000000000))')).toBeInTheDocument();

    // Should have gray color for regular time display
    const timeElement = screen.getByText('(TIME(1680000000000))');
    expect(timeElement).toHaveClass('text-gray-400');
    expect(timeElement).not.toHaveClass('animate-pulse');
  });
});
