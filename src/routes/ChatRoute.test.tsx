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

vi.mock('@features/chat/api/chatQueries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/api/chatQueries')>()),
  loadRecentChatLogs: vi.fn(() => Promise.resolve([])),
  loadChatRanking: vi.fn(() => Promise.resolve([])),
}));
vi.mock('@features/chat/api/realtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/api/realtime')>()),
  subscribeChatLogs: vi.fn((_roomId: string, callback: (chat: Chat) => void) => {
    realtimeListeners.add(callback);
    return {
      unsubscribe: () => {
        realtimeListeners.delete(callback);
      },
    };
  }),
}));
vi.mock('@features/chat/api/saveChat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/api/saveChat')>()),
  saveChatLogOptimistic: vi.fn((_roomId: string, chat: unknown) =>
    Promise.resolve({ ...(chat as object), uuid: 'server-uuid', optimistic: false })
  ),
}));

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

  // 表示用のログ (直近分) ではなく、サーバー集計 (全期間) を出す
  it('ランキングは開いたときにサーバー集計を取得して表示する', async () => {
    const { loadChatRanking } = await import('@features/chat/api/chatQueries');
    vi.mocked(loadChatRanking).mockResolvedValueOnce([
      { name: '昔の常連', count: 1234, lastTime: 1, color: '#123456', host: '203.*.*.9' },
    ]);
    await enterRoom();
    // 閉じている間は取得しない
    expect(loadChatRanking).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('[ランキング]'));

    expect(await screen.findByText('昔の常連')).toBeInTheDocument();
    expect(screen.getByText('1234')).toBeInTheDocument();
    expect(loadChatRanking).toHaveBeenCalledWith('superbeginner');
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

// 初期表示を軽くするため入室前は 10 件だけ取得し、入室で全件へ広げる
// (.kiro/specs/top-and-transition-performance Requirement 6)
describe('ChatRoute の段階的なログ取得', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeListeners.clear();
  });

  it('入室前は 10 件だけ取得し、全件取得は行わない', async () => {
    const { loadRecentChatLogs } = await import('@features/chat/api/chatQueries');

    render(<ChatRoute roomId="superbeginner" />);

    await waitFor(() => expect(loadRecentChatLogs).toHaveBeenCalledWith('superbeginner', 10));
    expect(loadRecentChatLogs).not.toHaveBeenCalledWith('superbeginner', 100);
  });

  it('「チャットに参加する」で全件取得へ広げる', async () => {
    const { loadRecentChatLogs } = await import('@features/chat/api/chatQueries');

    await enterRoom();

    await waitFor(() => expect(loadRecentChatLogs).toHaveBeenCalledWith('superbeginner', 100));
  });
});

describe('ChatRoute のエラー表示', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeListeners.clear();
  });

  it('ログの取得に失敗すると「発言はありません」ではなく失敗と再読み込みの導線を出す', async () => {
    const { loadRecentChatLogs } = await import('@features/chat/api/chatQueries');
    vi.mocked(loadRecentChatLogs).mockRejectedValueOnce(new Error('network'));

    render(<ChatRoute roomId="superbeginner" />);

    expect(await screen.findByText('チャットログの読み込みに失敗しました。')).toBeInTheDocument();
    expect(screen.queryByText('まだ発言はありません。')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '再読み込み' }));
    await waitFor(() => {
      expect(screen.queryByText('チャットログの読み込みに失敗しました。')).not.toBeInTheDocument();
    });
  });

  it('入室の保存に失敗すると入室フォームに戻り、エラーを表示する', async () => {
    const { saveChatLogOptimistic } = await import('@features/chat/api/saveChat');
    vi.mocked(saveChatLogOptimistic).mockRejectedValueOnce(new Error('Failed to save chat: 500'));

    render(<ChatRoute roomId="superbeginner" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'おなまえ' }), {
      target: { value: 'ゆい' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'チャットに参加する' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('入室に失敗しました');
    expect(screen.getByRole('button', { name: 'チャットに参加する' })).toBeInTheDocument();
  });
});
