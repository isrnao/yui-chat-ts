import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoomLogStore } from '../api/roomLogStore';
import type { Chat } from '../types';
import { SupersededSessionError, useChatSession, type SessionTarget } from './useChatSession';

const network = vi.hoisted(() => ({ admin: vi.fn(), send: vi.fn() }));
vi.mock('./useChatSender', () => ({
  useChatSender: () => ({ sendAdminEvent: network.admin, sendUserMessage: network.send }),
}));
vi.mock('@shared/utils/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('../utils/webAudioPlayer', () => ({
  playNotificationSound: vi.fn(),
  stopNotificationSound: vi.fn(),
}));

function setup() {
  const measurement = {
    onJoinStarted: vi.fn(),
    onJoinFailed: vi.fn(),
    onEntered: vi.fn(() => 'direct' as const),
    onOwnMessagePending: vi.fn(),
    onOwnMessageSaved: vi.fn(),
    onRealtimeChat: vi.fn(),
    onExited: vi.fn(),
  };
  const store = createRoomLogStore({
    initialLimit: 10,
    fetch: async () => [],
    subscribe: () => ({ unsubscribe() {} }),
  });
  const hook = renderHook(
    ({ name, target }: { name: string; target: SessionTarget }) =>
      useChatSession({
        target,
        identity: { name, color: '#000', email: '' },
        store,
        addOptimistic: vi.fn(),
        measurement,
      }),
    { initialProps: { name: '最初', target: { kind: 'all', replyTo: 'com_sb' } as SessionTarget } }
  );
  return { ...hook, measurement };
}

describe('sessionの非同期境界', () => {
  beforeEach(() => {
    network.admin.mockReset().mockResolvedValue({});
    network.send.mockReset().mockImplementation(async (_room: string, chat: Chat) => ({
      ...chat,
      uuid: 'saved',
      optimistic: false,
    }));
  });

  it('旧入室の失敗で再入室を巻き戻さず、入室未確定の投稿を拒否する', async () => {
    let reject: (reason: Error) => void = () => {};
    network.admin.mockImplementationOnce(
      () =>
        new Promise((_resolve, no) => {
          reject = no;
        })
    );
    const { result, measurement } = setup();
    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.enter({ name: 'A', color: '#000' }).catch((error: unknown) => error);
    });
    await act(async () => {
      await expect(result.current.send('未確定')).rejects.toThrow('入室');
    });
    expect(network.send).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.exit();
      await result.current.enter({ name: 'B', color: '#000', silent: true });
    });
    await act(async () => {
      reject(new Error('old failure'));
      expect(await pending).toBeInstanceOf(SupersededSessionError);
    });
    expect(result.current.phase).toBe('entered');
    expect(result.current.sessionIdentity?.name).toBe('B');
    expect(measurement.onEntered).toHaveBeenCalledTimes(1);
  });

  it('背景の設定変更が送信者・退室名を変えない', async () => {
    const { result, rerender } = setup();
    await act(async () => {
      await result.current.enter({ name: '本人', color: '#000', silent: true });
    });
    rerender({ name: '', target: { kind: 'all', replyTo: 'com_sb' } });
    await act(async () => {
      await result.current.send('本文');
    });
    expect(network.send.mock.calls[0]![1].name).toBe('本人');
    await act(async () => {
      await result.current.exit();
    });
    expect(network.admin).toHaveBeenLastCalledWith(
      'all',
      expect.objectContaining({ name: '本人' })
    );
  });
});
