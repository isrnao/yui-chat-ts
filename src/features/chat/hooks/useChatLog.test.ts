import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { reduceOptimisticChat, useChatLog } from './useChatLog';
import type { Chat } from '@features/chat/types';

// Supabaseとの統合、useOptimistic、リアルタイム機能が複雑になったため
// 基本的なインターフェーステストのみに簡略化

// APIモック
vi.mock('@features/chat/api/chatApi', () => ({
  loadChatLogs: vi.fn(() => new Promise<never>(() => {})),
  loadInitialChatLogs: vi.fn().mockResolvedValue([]),
  getCacheInfo: vi.fn().mockReturnValue({ cached: false }),
  saveChatLog: vi.fn().mockResolvedValue(undefined),
  clearChatLogs: vi.fn().mockResolvedValue(undefined),
  subscribeChatLogs: vi.fn(() => ({ unsubscribe: vi.fn() })),
}));

describe('useChatLog', () => {
  it('should initialize and return expected interface', () => {
    const { result } = renderHook(() => useChatLog());

    // フックが期待されるインターフェースを返すことのみをテスト
    expect(result.current).toHaveProperty('chatLog');
    expect(result.current).toHaveProperty('setChatLog');
    expect(result.current).toHaveProperty('addChat');
    expect(result.current).toHaveProperty('addOptimistic');
    expect(result.current).toHaveProperty('mergeChat');
    expect(result.current).toHaveProperty('clear');

    expect(Array.isArray(result.current.chatLog)).toBe(true);
    expect(typeof result.current.setChatLog).toBe('function');
    expect(typeof result.current.addChat).toBe('function');
    expect(typeof result.current.addOptimistic).toBe('function');
    expect(typeof result.current.mergeChat).toBe('function');
    expect(typeof result.current.clear).toBe('function');
  });

  it('prepends a temp optimistic chat to the base state', () => {
    const tempChat: Chat = {
      uuid: 'temp-1',
      name: 'Taro',
      color: '#f00',
      message: 'Hello',
      time: 1_700_000_000_000,
      client_time: 1_700_000_000_000,
      ip: 'test-ip',
      ua: 'test-ua',
    };

    expect(reduceOptimisticChat([], tempChat)).toEqual([tempChat]);
  });

  it('skips a temp optimistic chat when the saved chat already exists in base state', () => {
    const savedChat: Chat = {
      uuid: '018f-saved',
      room_id: 'superbeginner',
      name: 'Taro',
      color: '#f00',
      message: 'Hello',
      time: 1_700_000_000_100,
      client_time: 1_700_000_000_000,
      optimistic: false,
      ip: 'test-ip',
      ua: 'test-ua',
    };
    const tempChat: Chat = {
      ...savedChat,
      uuid: 'temp-1',
      time: 1_700_000_000_000,
      optimistic: true,
    };
    const baseState = [savedChat];

    expect(reduceOptimisticChat(baseState, tempChat)).toBe(baseState);
  });

  it.each([
    ['message', { message: 'Different message' }],
    ['room_id', { room_id: 'hajime' }],
    ['system', { system: true }],
    ['color', { color: '#00f' }],
    ['optimistic', { optimistic: true }],
  ] satisfies Array<[string, Partial<Chat>]>)(
    'does not skip distinct temp chats when saved %s differs',
    (_, savedOverride) => {
      const tempChat: Chat = {
        uuid: 'temp-1',
        room_id: 'superbeginner',
        name: 'Taro',
        color: '#f00',
        message: 'Hello',
        time: 1_700_000_000_000,
        client_time: 1_700_000_000_000,
        optimistic: true,
        ip: 'test-ip',
        ua: 'test-ua',
      };
      const savedChat: Chat = {
        ...tempChat,
        ...savedOverride,
        uuid: '018f-saved',
        time: 1_700_000_000_100,
      };

      expect(reduceOptimisticChat([savedChat], tempChat)).toEqual([tempChat, savedChat]);
    }
  );

  it('keeps saved realtime inserts idempotent by uuid', () => {
    const savedChat: Chat = {
      uuid: '018f-saved',
      name: 'Taro',
      color: '#f00',
      message: 'Hello',
      time: 1_700_000_000_000,
      client_time: 1_700_000_000_000,
      ip: 'test-ip',
      ua: 'test-ua',
    };

    const first = reduceOptimisticChat([], savedChat);
    const second = reduceOptimisticChat(first, savedChat);

    expect(second).toHaveLength(1);
    expect(second[0]).toEqual(savedChat);
  });

  describe('optimisticNonce による dedup (主キー)', () => {
    it('nonce 一致なら他フィールドが違っても重複扱いで temp をスキップする', () => {
      // legacy fallback キー (client_time / name / message) はすべて異なるが、
      // nonce が一致するので saved 側と同一とみなして temp は prepend されない。
      const savedChat: Chat = {
        uuid: '018f-saved',
        room_id: 'superbeginner',
        name: 'Taro',
        color: '#f00',
        message: 'Hello',
        time: 1_700_000_000_100,
        client_time: 1_700_000_000_000,
        optimistic: false,
        ip: 'test-ip',
        ua: 'test-ua',
        metadata: { version: 1, optimisticNonce: 'nonce-abc' },
      };
      const tempChat: Chat = {
        uuid: 'temp-xyz',
        room_id: 'hajime', // different
        name: 'Different', // different
        color: '#000', // different
        message: 'Different', // different
        time: 999,
        client_time: 555, // different (legacy fallback ならアンマッチになる)
        optimistic: true,
        ip: 'test-ip',
        ua: 'test-ua',
        metadata: { version: 1, optimisticNonce: 'nonce-abc' },
      };

      expect(reduceOptimisticChat([savedChat], tempChat)).toEqual([savedChat]);
    });

    it('nonce が異なれば同文面でも別チャットとして残す', () => {
      const savedChat: Chat = {
        uuid: '018f-saved',
        room_id: 'superbeginner',
        name: 'Taro',
        color: '#f00',
        message: 'Hello',
        time: 1_700_000_000_100,
        client_time: 1_700_000_000_000,
        optimistic: false,
        ip: 'test-ip',
        ua: 'test-ua',
        metadata: { version: 1, optimisticNonce: 'nonce-saved' },
      };
      const tempChat: Chat = {
        ...savedChat,
        uuid: 'temp-other',
        time: 999,
        optimistic: true,
        metadata: { version: 1, optimisticNonce: 'nonce-temp' },
      };

      const next = reduceOptimisticChat([savedChat], tempChat);
      expect(next).toEqual([tempChat, savedChat]);
    });

    it('fallback は両側で client_time が数値のときのみ成立する', () => {
      // 旧データ (nonce なし) で client_time が両側 undefined だと、
      // undefined === undefined で別メッセージ同士が誤一致してしまうのを防ぐ回帰テスト。
      const savedChatNoClientTime: Chat = {
        uuid: '018f-saved',
        room_id: 'superbeginner',
        name: 'Taro',
        color: '#f00',
        message: 'A',
        time: 1_700_000_000_100,
        optimistic: false,
        ip: 'test-ip',
        ua: 'test-ua',
      };
      const tempChatNoClientTime: Chat = {
        uuid: 'temp-1',
        room_id: 'superbeginner',
        name: 'Taro',
        color: '#f00',
        message: 'B', // 全然違うメッセージ
        time: 999,
        optimistic: true,
        ip: 'test-ip',
        ua: 'test-ua',
      };

      // 両側 client_time が無いので fallback は不成立 → 別エントリとして prepend される
      expect(reduceOptimisticChat([savedChatNoClientTime], tempChatNoClientTime)).toEqual([
        tempChatNoClientTime,
        savedChatNoClientTime,
      ]);
    });
  });
});
