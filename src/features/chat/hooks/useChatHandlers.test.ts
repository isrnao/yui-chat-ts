import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Chat } from '@features/chat/types';
import { useChatHandlers } from './useChatHandlers';

vi.mock('@features/chat/api/chatApi', () => ({
  loadChatLogs: vi.fn(() => Promise.resolve([] as Chat[])),
  saveChatLogOptimistic: vi.fn((_roomId: string, chat: Chat) =>
    Promise.resolve({ ...chat, uuid: 'server-uuid', optimistic: false })
  ),
  clearChatLogsByName: vi.fn(() => Promise.resolve()),
  broadcastLookEvent: vi.fn(),
  broadcastUnlookEvent: vi.fn(),
  createOptimisticChat: vi.fn((chat: Omit<Chat, 'uuid' | 'time' | 'optimistic'>) => ({
    ...chat,
    uuid: 'temp-1',
    time: 1,
    optimistic: true,
  })),
}));

function setup() {
  const setShowRanking = vi.fn();
  const props = {
    roomId: 'superbeginner' as const,
    name: 'ゆい',
    color: '#ff69b4',
    email: '',
    myId: 'me',
    entered: true,
    setEntered: vi.fn(),
    setChatLog: vi.fn(),
    setShowRanking,
    setName: vi.fn(),
    setMessage: vi.fn(),
    addOptimistic: vi.fn(),
    mergeChat: vi.fn(),
  };
  const { result } = renderHook(() => useChatHandlers(props));
  return { result, setShowRanking, props };
}

describe('useChatHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ランキング表示中でもチャットへ戻れる導線として、更新・発言で表示を閉じる
  it('更新でランキング表示を閉じてログを再取得する', async () => {
    const { result, setShowRanking } = setup();
    const { loadChatLogs } = await import('@features/chat/api/chatApi');

    await act(async () => {
      result.current.handleReload();
    });

    expect(setShowRanking).toHaveBeenCalledWith(false);
    expect(loadChatLogs).toHaveBeenCalledWith('superbeginner');
  });

  it('発言でランキング表示を閉じる', async () => {
    const { result, setShowRanking } = setup();

    await act(async () => {
      await result.current.handleSend('こんにちは');
    });

    expect(setShowRanking).toHaveBeenCalledWith(false);
  });
});
