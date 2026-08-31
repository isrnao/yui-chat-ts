import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatRoute from './ChatRoute';
import type { Chat } from '@features/chat/types';

// Realtime の INSERT を任意のタイミングで流し込めるよう、購読コールバックを保持する
const realtimeListeners = new Set<(chat: Chat) => void>();

function emitRealtimeChat(chat: Chat) {
  act(() => {
    for (const listener of realtimeListeners) listener(chat);
  });
}

vi.mock('@features/chat/api/chatApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@features/chat/api/chatApi')>();
  return {
    ...actual,
    loadChatLogs: vi.fn(() => Promise.resolve([])),
    subscribeChatLogs: vi.fn((_roomId: string, callback: (chat: Chat) => void) => {
      realtimeListeners.add(callback);
      return {
        unsubscribe: () => {
          realtimeListeners.delete(callback);
        },
      };
    }),
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
    realtimeListeners.clear();
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

// 回帰テスト: ChatRoom のフォーカス effect が chatLog に依存していた頃は、
// 他人の発言が Realtime で届くたびに入力欄へフォーカスが飛んでいた
// (モバイルではソフトキーボードが勝手に再表示される)
describe('ChatRoute のフォーカス', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeListeners.clear();
  });

  it('他人の発言が Realtime で届いてもフォーカスを奪わない', async () => {
    await enterRoom();

    const select = screen.getByRole('combobox', { name: 'ログ行数' });
    select.focus();
    expect(document.activeElement).toBe(select);

    emitRealtimeChat({
      uuid: '018f-remote',
      room_id: 'superbeginner',
      name: 'ほかの人',
      color: '#00f',
      message: 'こんばんは',
      time: Date.now(),
      client_time: Date.now(),
      ip_masked: '203.0.113.*',
      ua: 'test-ua',
    });

    await waitFor(() => expect(screen.getByText('こんばんは')).toBeInTheDocument());
    expect(document.activeElement).toBe(select);
  });
});
