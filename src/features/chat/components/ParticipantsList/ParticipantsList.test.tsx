import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, render, screen, cleanup } from '@testing-library/react';
import ParticipantsList from './index';
import type { Chat } from '@features/chat/types';

vi.mock('@shared/utils/format', () => ({
  formatTime: (t: number) => `TIME(${t})`,
  formatLegacyDateTime: (t: number) => `DATE(${t})`,
}));

describe('ParticipantsList', () => {
  const fixedTime = 1680000000000;
  const chat = (uuid: string, name: string, color: string, time: number): Chat => ({
    uuid,
    name,
    color,
    message: 'hi',
    time,
    ip_masked: '',
    ua: '',
  });
  const chatLog: Chat[] = [
    chat('p1', 'Alice', '#ff0000', fixedTime - 1000),
    chat('p2', 'Bob', '#00ff00', fixedTime - 2000),
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(fixedTime);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders "（なし）" when no participants', () => {
    render(<ParticipantsList chatLog={[]} />);
    expect(screen.getByText('参加者(0):')).toBeInTheDocument();
    expect(screen.getByText('（なし）')).toBeInTheDocument();
  });

  it('renders participants with their colors', () => {
    render(<ParticipantsList chatLog={chatLog} />);

    const alice = screen.getByText('Alice');
    const bob = screen.getByText('Bob');

    expect(alice).toHaveStyle({ color: '#ff0000' });
    expect(bob).toHaveStyle({ color: '#00ff00' });
  });

  it('displays current time in header', () => {
    render(<ParticipantsList chatLog={[]} />);

    const timeElement = screen.getByText(/\[TIME\(/);
    expect(timeElement).toBeInTheDocument();
  });

  it('現在時刻は視覚回帰テストの比較対象から外す', () => {
    const { container } = render(<ParticipantsList chatLog={[]} />);

    // Chromatic が毎回差分として拾わないよう data-chromatic="ignore" を付けている
    const clock = container.querySelector('[data-chromatic="ignore"]');
    expect(clock).toBeInTheDocument();
    expect(clock?.textContent).toMatch(/^\[.+\]$/);
  });

  it('新しい発言がなくても、5 分を過ぎた発言者を分の境界で参加者から外す', () => {
    // 4 分前に発言した人がいる状態から 3 分進めると、窓（5 分）から外れる
    render(<ParticipantsList chatLog={[chat('p1', 'Alice', '#ff0000', fixedTime - 4 * 60_000)]} />);
    expect(screen.getByText('参加者(1):')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3 * 60_000);
    });

    expect(screen.getByText('参加者(0):')).toBeInTheDocument();
  });
});
