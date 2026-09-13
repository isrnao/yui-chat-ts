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
  const measurement = {
    onJoinStarted: vi.fn(),
    onJoinFailed: vi.fn(),
    onEntered: vi.fn(() => 'direct' as const),
    onOwnMessagePending: vi.fn(),
    onOwnMessageSaved: vi.fn(),
    onRealtimeChat: vi.fn(),
    onExited: vi.fn(),
  };
  const props = {
    roomId: 'superbeginner' as const,
    name: 'ゆい',
    color: '#ff69b4',
    email: '',
    setEntered: vi.fn(),
    setChatLog: vi.fn(),
    setShowRanking,
    setName: vi.fn(),
    setMessage: vi.fn(),
    addOptimistic: vi.fn(),
    mergeChat: vi.fn(),
    measurement,
  };
  const { result } = renderHook(() => useChatHandlers(props));
  return { result, setShowRanking, props, measurement };
}

describe('useChatHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('更新でログを再取得する', async () => {
    const { result } = setup();
    const { loadChatLogs } = await import('@features/chat/api/chatApi');

    await act(async () => {
      result.current.handleReload();
    });

    expect(loadChatLogs).toHaveBeenCalledWith('superbeginner');
  });

  // 表示の切り替え自体は ChatRoom の onBackToChat が担うが、コマンド経由の送信でも
  // ランキングが残らないよう handleSend 側でも閉じている
  it('発言でランキング表示を閉じる', async () => {
    const { result, setShowRanking } = setup();

    await act(async () => {
      await result.current.handleSend('こんにちは');
    });

    expect(setShowRanking).toHaveBeenCalledWith(false);
  });
});
