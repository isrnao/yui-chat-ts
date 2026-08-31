import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatRoute from './ChatRoute';

vi.mock('@features/chat/api/chatApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@features/chat/api/chatApi')>();
  return {
    ...actual,
    loadChatLogs: vi.fn(() => Promise.resolve([])),
    subscribeChatLogs: vi.fn(() => ({ unsubscribe: vi.fn() })),
    saveChatLogOptimistic: vi.fn((_roomId: string, chat: unknown) =>
      Promise.resolve({ ...(chat as object), uuid: 'server-uuid', optimistic: false })
    ),
  };
});

async function enterRoom() {
  render(<ChatRoute roomId="superbeginner" />);
  fireEvent.change(screen.getByRole('textbox', { name: 'おなまえ' }), {
    target: { value: 'ゆい' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'チャットに参加する' }));
  await screen.findByText('[ランキング]');
}

describe('ChatRoute のランキング切り替え', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('[ランキング] でランキングに切り替わり、更新でチャットログへ戻る', async () => {
    await enterRoom();

    fireEvent.click(screen.getByText('[ランキング]'));
    expect(await screen.findByText(/の発言ランキング$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '更新' }));

    await waitFor(() => {
      expect(screen.queryByText(/の発言ランキング$/)).not.toBeInTheDocument();
    });
  });

  it('[ランキング] でランキングに切り替わり、発言でチャットログへ戻る', async () => {
    await enterRoom();

    fireEvent.click(screen.getByText('[ランキング]'));
    expect(await screen.findByText(/の発言ランキング$/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: '発言' }), {
      target: { value: 'こんにちは' },
    });
    fireEvent.click(screen.getByRole('button', { name: '発言' }));

    await waitFor(() => {
      expect(screen.queryByText(/の発言ランキング$/)).not.toBeInTheDocument();
    });
  });

  // 「ランキングからチャットに戻る」目的で押されるため、入力が空でも戻す必要がある
  it('入力が空のまま発言を押してもチャットログへ戻る', async () => {
    await enterRoom();

    fireEvent.click(screen.getByText('[ランキング]'));
    expect(await screen.findByText(/の発言ランキング$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '発言' }));

    await waitFor(() => {
      expect(screen.queryByText(/の発言ランキング$/)).not.toBeInTheDocument();
    });
  });
});
