import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatRoute from './ChatRoute';

/**
 * ランキングを開いている間もログ一覧は Activity で残し、戻ったときに再マウントしない
 * （.kiro/specs/react-2026-refactoring Requirement 12.2 / Task 12.5）。
 */
const mounts = vi.hoisted(() => ({ count: 0 }));

vi.mock('@features/chat/components/ChatLogList', () => ({
  // Activity は非表示の間 Effect を止め、表示に戻すと Effect をもう一度走らせる（再マウントではない）。
  // そのため Effect ではなく、インスタンスが作られたとき（useState の初期化）を数える
  default: function ChatLogListMock() {
    useState(() => {
      mounts.count += 1;
      return mounts.count;
    });
    return <div data-testid="chat-log-list-mock">ログ</div>;
  },
}));
vi.mock('@features/chat/api/chatQueries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/api/chatQueries')>()),
  loadRecentChatLogs: vi.fn(() => Promise.resolve([])),
  loadChatRanking: vi.fn(() => Promise.resolve([])),
}));
vi.mock('@features/chat/api/realtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/api/realtime')>()),
  subscribeChatLogs: vi.fn(() => ({ unsubscribe: vi.fn() })),
  onLookBroadcast: vi.fn(() => vi.fn()),
}));
vi.mock('@features/chat/api/saveChat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/api/saveChat')>()),
  saveChatLogOptimistic: vi.fn((_roomId: string, chat: object) =>
    Promise.resolve({ ...chat, uuid: 'server-uuid', optimistic: false })
  ),
}));

describe('ChatRoute のランキングとログの切り替え', () => {
  beforeEach(() => {
    mounts.count = 0;
  });

  it('ランキングから戻ってもログ一覧を再マウントせず、スクロール位置も保つ', async () => {
    render(<ChatRoute roomId="superbeginner" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'おなまえ' }), {
      target: { value: 'ゆい' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'チャットに参加する' }));
    await screen.findByText('[ランキング]');
    await screen.findByTestId('chat-log-list-mock');
    await waitFor(() => expect(mounts.count).toBe(1));

    const pane = screen.getByTestId('chat-log-pane');
    pane.scrollTop = 123;

    fireEvent.click(screen.getByText('[ランキング]'));
    expect(await screen.findByText(/の発言ランキング$/)).toBeInTheDocument();

    // 更新ボタン（onBackToChat）でログに戻る
    fireEvent.click(screen.getByRole('button', { name: '更新' }));
    await waitFor(() => {
      expect(screen.queryByText(/の発言ランキング$/)).not.toBeInTheDocument();
    });

    expect(mounts.count).toBe(1);
    expect(screen.getByTestId('chat-log-pane')).toBe(pane);
    expect(pane.scrollTop).toBe(123);
  });
});
