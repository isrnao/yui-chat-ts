import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatRoute from './ChatRoute';
import { addFilteredIp } from '@features/chat/utils/ipFilterStore';

/**
 * 「細字」の右の「フィルタ」で、フィルタの一覧をモーダルで開く（.kiro/specs/chat-ip-mute Requirement 4）。
 */
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

async function enterRoom() {
  render(<ChatRoute roomId="superbeginner" />);
  fireEvent.change(screen.getByRole('textbox', { name: 'おなまえ' }), {
    target: { value: 'ゆい' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'チャットに参加する' }));
  await screen.findByText('[ランキング]');
}

describe('ChatRoute のフィルタの一覧', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('「フィルタ」でモーダルを開き、Esc で閉じる。ログの枠はそのまま', async () => {
    await enterRoom();
    const pane = screen.getByTestId('chat-log-pane');

    fireEvent.click(screen.getByRole('button', { name: 'フィルタ' }));
    const dialog = await screen.findByRole('dialog', { name: 'フィルタ' });
    expect(screen.getByTestId('chat-log-pane')).toBe(pane);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('件数をリンクに出し、一覧で解除すると減る', async () => {
    addFilteredIp('219.*.*.253', ['たろう']);
    addFilteredIp('2001:*');
    await enterRoom();

    fireEvent.click(screen.getByRole('button', { name: 'フィルタ(2)' }));
    // ログに発言がなくても、保存した名前を出す
    expect(await screen.findByText('たろう')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '2001:* のフィルタを解除' }));
    expect(await screen.findByRole('button', { name: 'フィルタ(1)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
