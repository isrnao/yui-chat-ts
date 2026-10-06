import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { RoomLogStore } from '@features/chat/api/roomLogStore';
import type { Chat } from '@features/chat/types';
import { playNotificationSound, stopNotificationSound } from '@features/chat/utils/webAudioPlayer';
import { forgetOwnChatsForTest, rememberOwnChat } from '@features/chat/utils/ownMessages';
import { useLookSound } from './useLookSound';

vi.mock('@features/chat/utils/webAudioPlayer', () => ({
  playNotificationSound: vi.fn(() => Promise.resolve()),
  stopNotificationSound: vi.fn(),
  isAudioUnlocked: vi.fn(() => false),
  unlockAudio: vi.fn(() => Promise.resolve()),
}));

/** Realtime の INSERT（onInsert）だけを流せる store */
function fakeStore() {
  const listeners = new Set<(chat: Chat) => void>();
  const store = {
    onInsert: (listener: (chat: Chat) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as RoomLogStore;
  return { store, insert: (chat: Chat) => listeners.forEach((l) => l(chat)), listeners };
}

function chat(message: string, nonce = crypto.randomUUID()): Chat {
  return {
    uuid: crypto.randomUUID(),
    name: 'たろう',
    color: '#000',
    message,
    time: 1,
    ip_masked: '',
    ua: '',
    metadata: { version: 1, optimisticNonce: nonce },
  };
}

describe('useLookSound（保存された発言の INSERT から鳴らす、Issue #184）', () => {
  afterEach(() => {
    vi.clearAllMocks();
    forgetOwnChatsForTest();
  });

  it('Realtime の INSERT の look で鳴らし、unlook で止める', () => {
    const { store, insert } = fakeStore();
    renderHook(() => useLookSound(store));

    insert(chat(' look '));
    expect(playNotificationSound).toHaveBeenCalledTimes(1);
    insert(chat('unlook'));
    expect(stopNotificationSound).toHaveBeenCalledTimes(1);
  });

  it('自分の look の echo では鳴らさない（送り手は保存の完了で鳴らす）', () => {
    const { store, insert } = fakeStore();
    renderHook(() => useLookSound(store));
    const own = chat('look');
    rememberOwnChat(own);

    insert(own);
    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('look 以外の発言では鳴らさない', () => {
    const { store, insert } = fakeStore();
    renderHook(() => useLookSound(store));
    insert(chat('looking'));
    insert(chat('こんにちは'));
    expect(playNotificationSound).not.toHaveBeenCalled();
    expect(stopNotificationSound).not.toHaveBeenCalled();
  });

  it('取得（fetch）で入った発言は onInsert に来ないので鳴らない。アンマウントで登録を外す', () => {
    const { store, listeners } = fakeStore();
    const { unmount } = renderHook(() => useLookSound(store));
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);
  });
});
