import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatRoute from './ChatRoute';
import { addFilteredIp } from '@features/chat/utils/ipFilterStore';

/**
 * 「フィルタ」リンクで下段の編集画面を開閉する（.kiro/specs/chat-ip-mute Requirement 4）。
 * ログ一覧はランキングと同じく Activity で残し、戻ったときに再マウントしない。
 */
const mounts = vi.hoisted(() => ({ count: 0 }));

vi.mock('@features/chat/components/ChatLogList', () => ({
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

const PANEL_HEADING = /フィルタしている IP はありません|隠れている発言/;

async function enterRoom() {
  render(<ChatRoute roomId="superbeginner" />);
  fireEvent.change(screen.getByRole('textbox', { name: 'おなまえ' }), {
    target: { value: 'ゆい' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'チャットに参加する' }));
  await screen.findByText('[ランキング]');
  await screen.findByTestId('chat-log-list-mock');
}

describe('ChatRoute のフィルタの編集画面', () => {
  beforeEach(() => {
    mounts.count = 0;
    localStorage.clear();
  });

  it('「フィルタ」で開き、もう一度押すとログへ戻る。ログは再マウントせずスクロール位置を保つ', async () => {
    await enterRoom();
    const pane = screen.getByTestId('chat-log-pane');
    pane.scrollTop = 77;

    // 編集画面の見出しも「フィルタ」なので、開く前にフォームのリンクを取っておく
    const link = screen.getByRole('button', { name: 'フィルタ' });
    fireEvent.click(link);
    expect(await screen.findByText(PANEL_HEADING)).toBeInTheDocument();

    fireEvent.click(link);
    await waitFor(() => expect(screen.queryByText(PANEL_HEADING)).not.toBeInTheDocument());

    expect(mounts.count).toBe(1);
    expect(screen.getByTestId('chat-log-pane')).toBe(pane);
    expect(pane.scrollTop).toBe(77);
  });

  it('件数をリンクに出し、解除すると減る', async () => {
    addFilteredIp('219.*.*.253');
    addFilteredIp('2001:*');
    await enterRoom();

    fireEvent.click(screen.getByRole('button', { name: 'フィルタ(2)' }));
    fireEvent.click(await screen.findByRole('button', { name: '2001:* のフィルタを解除' }));
    expect(await screen.findByRole('button', { name: 'フィルタ(1)' })).toBeInTheDocument();
  });

  it('ランキングを開くとフィルタの編集画面は閉じる。「更新」でもログへ戻る', async () => {
    await enterRoom();
    fireEvent.click(screen.getByRole('button', { name: 'フィルタ' }));
    expect(await screen.findByText(PANEL_HEADING)).toBeInTheDocument();

    fireEvent.click(screen.getByText('[ランキング]'));
    expect(await screen.findByText(/の発言ランキング$/)).toBeInTheDocument();
    expect(screen.queryByText(PANEL_HEADING)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'フィルタ' }));
    expect(await screen.findByText(PANEL_HEADING)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '更新' }));
    await waitFor(() => expect(screen.queryByText(PANEL_HEADING)).not.toBeInTheDocument());
  });
});
