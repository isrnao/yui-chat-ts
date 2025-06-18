import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ParticipantsList from './index';
import type { Participant } from '@features/chat/types';

vi.mock('@shared/utils/format', () => ({
  formatTime: (t: number) => `TIME(${t})`,
}));

describe('ParticipantsList', () => {
  const participants: Participant[] = [
    { id: 'p1', name: 'Alice', color: '#ff0000' },
    { id: 'p2', name: 'Bob', color: '#00ff00' },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1680000000000);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders "（なし）" when no participants', () => {
    render(<ParticipantsList participants={[]} />);
    expect(screen.getByText('参加者:')).toBeInTheDocument();
    expect(screen.getByText('（なし）')).toBeInTheDocument();
  });

  it('renders participants with their colors', () => {
    render(<ParticipantsList participants={participants} />);

    const alice = screen.getByText('Alice');
    const bob = screen.getByText('Bob');

    expect(alice).toHaveStyle({ color: '#ff0000' });
    expect(bob).toHaveStyle({ color: '#00ff00' });
  });

  it('displays current time in header', () => {
    render(<ParticipantsList participants={[]} />);

    const timeElement = screen.getByText(/\[TIME\(/);
    expect(timeElement).toBeInTheDocument();
  });
});
