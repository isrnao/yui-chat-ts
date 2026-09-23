import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Chat } from '@features/chat/types';
import { createRoomLogStore, type LogSource } from '@features/chat/api/roomLogStore';
import { useChatSession, type SessionTarget } from './useChatSession';
import { trackEvent } from '@shared/utils/analytics';
import { UserFacingError } from '@features/chat/utils/userFacingError';
import { saveChatLogOptimistic } from '@features/chat/api/saveChat';
import { clearChatLogsByName } from '@features/chat/api/chatQueries';
import { broadcastLookEvent } from '@features/chat/api/realtime';

vi.mock('@features/chat/api/saveChat', () => ({
  saveChatLogOptimistic: vi.fn((_roomId: string, chat: Chat) =>
    Promise.resolve({ ...chat, uuid: `server-${chat.message}`, optimistic: false })
  ),
  createOptimisticChat: vi.fn((chat: Omit<Chat, 'uuid' | 'time' | 'optimistic'>) => ({
    ...chat,
    uuid: `temp-${chat.message}`,
    time: 1,
    optimistic: true,
  })),
}));
vi.mock('@features/chat/api/chatQueries', () => ({
  clearChatLogsByName: vi.fn(() => Promise.resolve()),
}));
vi.mock('@features/chat/api/realtime', () => ({
  broadcastLookEvent: vi.fn(),
  broadcastUnlookEvent: vi.fn(),
}));
vi.mock('@shared/utils/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('@shared/observability/newRelic', () => ({ recordSendChat: vi.fn() }));
vi.mock('@features/chat/utils/webAudioPlayer', () => ({
  playNotificationSound: vi.fn(() => Promise.resolve()),
  stopNotificationSound: vi.fn(),
}));

function chat(overrides: Partial<Chat>): Chat {
  return {
    uuid: 'x',
    name: 'ゆい',
    color: '#000',
    message: 'm',
    time: 1,
    ip_masked: '',
    ua: '',
    ...overrides,
  };
}

function setup(target: SessionTarget, initialChats: Chat[] = []) {
  const source: LogSource = {
    initialLimit: 10,
    fetch: () => Promise.resolve(initialChats),
    subscribe: () => ({ unsubscribe() {} }),
  };
  const store = createRoomLogStore(source);
  store.subscribe(() => {});
  const measurement = {
    onJoinStarted: vi.fn(),
    onJoinFailed: vi.fn(),
    onEntered: vi.fn(() => 'direct' as const),
    onOwnMessagePending: vi.fn(),
    onOwnMessageSaved: vi.fn(),
    onRealtimeChat: vi.fn(),
    onExited: vi.fn(),
  };
  const addOptimistic = vi.fn();
  const { result } = renderHook(() =>
    useChatSession({
      target,
      identity: { name: 'ゆい', color: '#ff69b4', email: '', avatar: 'hoshi1' },
      store,
      addOptimistic,
      measurement,
    })
  );
  return { result, store, measurement, addOptimistic };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('useChatSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('入室は保存を待たずに entered にし、Welcome を部屋に出して chat_enter を記録する', async () => {
    const { result, measurement } = setup({ kind: 'room', roomId: 'superbeginner' });

    let entering: Promise<void> | undefined;
    act(() => {
      entering = result.current.enter({ name: 'ゆい', color: '#ff69b4' });
    });
    expect(result.current.entered).toBe(true);
    await act(async () => {
      await entering;
    });

    expect(saveChatLogOptimistic).toHaveBeenCalledWith(
      'superbeginner',
      expect.objectContaining({ message: 'ゆい さん、Welcome to お気楽チャット☆' }),
      undefined
    );
    expect(measurement.onJoinStarted).toHaveBeenCalledWith('superbeginner');
    expect(trackEvent).toHaveBeenCalledWith(
      'chat_enter',
      expect.objectContaining({ room_id: 'superbeginner' })
    );
  });

  it('入室の保存に失敗すると entered を戻してエラーを返す', async () => {
    vi.mocked(saveChatLogOptimistic).mockRejectedValueOnce(new Error('Failed to save chat'));
    const { result, measurement } = setup({ kind: 'room', roomId: 'superbeginner' });

    await act(async () => {
      await expect(result.current.enter({ name: 'ゆい', color: '#000' })).rejects.toThrow();
    });
    expect(result.current.entered).toBe(false);
    expect(measurement.onJoinFailed).toHaveBeenCalledWith('superbeginner', 'save_error');
  });

  it('全部屋まとめの入退室メッセージは all に出す', async () => {
    const { result } = setup({ kind: 'all', replyTo: 'superbeginner' });
    await act(async () => {
      await result.current.enter({ name: 'ゆい', color: '#000' });
    });
    await act(async () => {
      await result.current.exit();
    });
    expect(vi.mocked(saveChatLogOptimistic).mock.calls.map(([roomId]) => roomId)).toEqual([
      'all',
      'all',
    ]);
    expect(result.current.entered).toBe(false);
  });

  it('全部屋まとめの発言は返信先に保存し、アバターを metadata に足す', async () => {
    const { result } = setup({ kind: 'all', replyTo: 'com_sb' });
    await act(async () => {
      await result.current.send('こんにちは', { version: 1, fontStyle: { bold: true } });
    });
    expect(saveChatLogOptimistic).toHaveBeenCalledWith(
      'com_sb',
      expect.objectContaining({
        room_id: 'com_sb',
        metadata: { version: 1, avatar: 'hoshi1', fontStyle: { bold: true } },
      }),
      expect.objectContaining({ operationId: expect.any(String) })
    );
    expect(trackEvent).toHaveBeenCalledWith(
      'message_sent',
      expect.objectContaining({ room_id: 'com_sb' })
    );
  });

  it('look は部屋単位のビューだけ Broadcast する', async () => {
    const room = setup({ kind: 'room', roomId: 'superbeginner' });
    await act(async () => {
      await room.result.current.send('look');
    });
    expect(broadcastLookEvent).toHaveBeenCalledWith('superbeginner', 'server-look');

    vi.mocked(broadcastLookEvent).mockClear();
    const all = setup({ kind: 'all', replyTo: 'superbeginner' });
    await act(async () => {
      await all.result.current.send('look');
    });
    expect(broadcastLookEvent).not.toHaveBeenCalled();
  });

  it('部屋単位の clear は自分の発言をログから取り除く', async () => {
    const { result, store } = setup({ kind: 'room', roomId: 'superbeginner' }, [
      chat({ uuid: 'mine', name: 'ゆい' }),
      chat({ uuid: 'other', name: 'たろう' }),
    ]);
    await flush();

    await act(async () => {
      await result.current.send('clear');
    });
    expect(clearChatLogsByName).toHaveBeenCalledWith('superbeginner', 'ゆい');
    expect(store.getSnapshot().chats.map((c) => c.uuid)).toEqual(['other']);
  });

  it('全部屋まとめの clear は対象がなければエラーにし、削除しない', async () => {
    const { result } = setup({ kind: 'all', replyTo: 'superbeginner' }, [
      chat({ uuid: 'elsewhere', name: 'ゆい', room_id: 'com_sb' }),
    ]);
    await flush();

    await act(async () => {
      await expect(result.current.send('clear')).rejects.toThrow('削除対象の発言がありません');
    });
    expect(clearChatLogsByName).not.toHaveBeenCalled();
  });

  it('cut と空の発言は保存しない', async () => {
    const { result } = setup({ kind: 'room', roomId: 'superbeginner' });
    await act(async () => {
      await result.current.send('cut');
      await result.current.send('   ');
    });
    expect(saveChatLogOptimistic).not.toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith('command_used', {
      room_id: 'superbeginner',
      command: 'cut',
    });
  });

  it('名前の検証エラーは利用者向けのエラー（UserFacingError）として返す', async () => {
    const { result } = setup({ kind: 'room', roomId: 'superbeginner' });
    await act(async () => {
      await expect(result.current.enter({ name: '', color: '#000' })).rejects.toBeInstanceOf(
        UserFacingError
      );
    });
    expect(saveChatLogOptimistic).not.toHaveBeenCalled();
  });

  it('退室は保存を待たずに entered を戻す', async () => {
    const { result } = setup({ kind: 'room', roomId: 'superbeginner' });
    await act(async () => {
      await result.current.enter({ name: 'ゆい', color: '#000' });
    });

    let resolveSave: (chat: Chat) => void = () => {};
    vi.mocked(saveChatLogOptimistic).mockReturnValueOnce(
      new Promise<Chat>((resolve) => {
        resolveSave = resolve;
      })
    );
    let exiting: Promise<void> | undefined;
    act(() => {
      exiting = result.current.exit();
    });
    expect(result.current.entered).toBe(false);

    await act(async () => {
      resolveSave(chat({ uuid: 'server-exit' }));
      await exiting;
    });
  });
});
