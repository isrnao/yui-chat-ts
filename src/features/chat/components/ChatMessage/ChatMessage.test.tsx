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
  };

  const chatWithoutEmail: Chat = {
    id: '2',
    name: 'Bob',
    color: '#00ff00',
    message: 'Hi there',
    time: 1680000000000,
    email: '',
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
});
