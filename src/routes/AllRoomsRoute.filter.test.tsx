import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AllRoomsRoute from './AllRoomsRoute';

/**
 * 全部屋まとめでも「フィルタ」リンクで下段の編集画面を開閉し、ログ一覧は Activity で残す
 * （.kiro/specs/chat-ip-mute Requirement 4.3 / 4.4 / 4.10）。
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
  // 空だと一覧の代わりに「まだ発言はありません」を出すので、1 件返す
  loadAllRoomsChatLogs: vi.fn(() =>
    Promise.resolve([
      {
        uuid: '0190a000-0000-7000-8000-000000000001',
        room_id: 'superbeginner',
        name: 'たろう',
        color: '#000',
        message: 'こんにちは',
        time: Date.now(),
        ip_masked: '219.*.*.253',
        ua: '',
      },
    ])
  ),
}));
vi.mock('@features/chat/api/realtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/api/realtime')>()),
  subscribeAllRoomsChatLogs: vi.fn(() => ({ unsubscribe: vi.fn() })),
  onLookBroadcast: vi.fn(() => vi.fn()),
}));
vi.mock('@features/chat/api/saveChat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/api/saveChat')>()),
  saveChatLogOptimistic: vi.fn((_roomId: string, chat: object) =>
    Promise.resolve({ ...chat, uuid: 'server-uuid', optimistic: false })
  ),
}));

const PANEL_TEXT = /フィルタしている IP はありません/;

describe('AllRoomsRoute のフィルタの編集画面', () => {
  beforeEach(() => {
    mounts.count = 0;
    localStorage.clear();
  });

  it('「フィルタ」で開閉し、ログ一覧を再マウントしない。「更新」でもログへ戻る', async () => {
    render(<AllRoomsRoute />);
    fireEvent.change(screen.getByRole('textbox', { name: 'おなまえ' }), {
      target: { value: 'ゆい' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'チャットに参加する' }));
    const link = await screen.findByRole('button', { name: 'フィルタ' });
    await screen.findByTestId('chat-log-list-mock');
    await waitFor(() => expect(mounts.count).toBe(1));

    fireEvent.click(link);
    expect(await screen.findByText(PANEL_TEXT)).toBeInTheDocument();
    fireEvent.click(link);
    await waitFor(() => expect(screen.queryByText(PANEL_TEXT)).not.toBeInTheDocument());

    fireEvent.click(link);
    expect(await screen.findByText(PANEL_TEXT)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '更新' }));
    await waitFor(() => expect(screen.queryByText(PANEL_TEXT)).not.toBeInTheDocument());

    expect(mounts.count).toBe(1);
  });
});
