import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AllRoomsRoute from './AllRoomsRoute';

/**
 * 全部屋まとめでも「フィルタ」でフィルタの一覧をモーダルで開く（.kiro/specs/chat-ip-mute Requirement 4）。
 */
vi.mock('@features/chat/api/chatQueries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/api/chatQueries')>()),
  loadAllRoomsChatLogs: vi.fn(() => Promise.resolve([])),
}));
vi.mock('@features/chat/api/realtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/api/realtime')>()),
  subscribeAllRoomsChatLogs: vi.fn(() => ({ unsubscribe: vi.fn() })),
}));
vi.mock('@features/chat/api/saveChat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/api/saveChat')>()),
  saveChatLogOptimistic: vi.fn((_roomId: string, chat: object) =>
    Promise.resolve({ ...chat, uuid: 'server-uuid', optimistic: false })
  ),
}));

describe('AllRoomsRoute のフィルタの一覧', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('「フィルタ」でモーダルを開き、× で閉じる', async () => {
    render(<AllRoomsRoute />);
    fireEvent.change(screen.getByRole('textbox', { name: 'おなまえ' }), {
      target: { value: 'ゆい' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'チャットに参加する' }));
    fireEvent.click(await screen.findByRole('button', { name: 'フィルタ' }));

    expect(await screen.findByRole('dialog', { name: 'フィルタ' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
