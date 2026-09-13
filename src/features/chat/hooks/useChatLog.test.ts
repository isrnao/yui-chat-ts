import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { reduceOptimisticChat, useChatLog } from './useChatLog';
import type { Chat } from '@features/chat/types';

// Supabaseとの統合、useOptimistic、リアルタイム機能が複雑になったため
// 基本的なインターフェーステストのみに簡略化

// APIモック
const {
  loadChatLogsMock,
  loadRecentChatLogsMock,
  subscribeChatLogsMock,
  emitRealtime,
  emitStatus,
  clearRealtimeListeners,
} = vi.hoisted(() => {
  const listeners = new Set<(chat: Chat) => void>();
  const statusListeners = new Set<(status: 'connecting' | 'connected' | 'disconnected') => void>();
  return {
    loadChatLogsMock: vi.fn(),
    loadRecentChatLogsMock: vi.fn(),
    subscribeChatLogsMock: vi.fn(
      (
        _roomId: string,
        callback: (chat: Chat) => void,
        onStatus?: (status: 'connecting' | 'connected' | 'disconnected') => void
      ) => {
        listeners.add(callback);
        if (onStatus) statusListeners.add(onStatus);
        // 購読の張り直しを検証したいので unsubscribe も spy にする
        return {
          unsubscribe: vi.fn(() => {
            listeners.delete(callback);
            if (onStatus) statusListeners.delete(onStatus);
          }),
        };
      }
    ),
    emitStatus: (status: 'connecting' | 'connected' | 'disconnected') => {
      for (const l of statusListeners) l(status);
    },
    emitRealtime: (chat: Chat) => {
      for (const listener of listeners) listener(chat);
    },
    clearRealtimeListeners: () => {
      listeners.clear();
      statusListeners.clear();
    },
  };
});

vi.mock('@features/chat/api/chatApi', () => ({
  loadChatLogs: loadChatLogsMock,
  loadRecentChatLogs: loadRecentChatLogsMock,
  loadInitialChatLogs: vi.fn().mockResolvedValue([]),
  getCacheInfo: vi.fn().mockReturnValue({ cached: false }),
  subscribeChatLogs: subscribeChatLogsMock,
}));

function makeChat(overrides: Partial<Chat> & Pick<Chat, 'uuid' | 'time'>): Chat {
  return {
    room_id: 'superbeginner',
    name: 'Taro',
    color: '#f00',
    message: 'Hello',
    client_time: overrides.time,
    ip_masked: 'test-ip',
    ua: 'test-ua',
    ...overrides,
  };
}

describe('useChatLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRealtimeListeners();
    loadChatLogsMock.mockReturnValue(new Promise<never>(() => {}));
    loadRecentChatLogsMock.mockReturnValue(new Promise<never>(() => {}));
  });

  it('should initialize and return expected interface', () => {
    const { result } = renderHook(() => useChatLog());

    // フックが期待されるインターフェースを返すことのみをテスト
    expect(result.current).toHaveProperty('chatLog');
    expect(result.current).toHaveProperty('setChatLog');
    expect(result.current).toHaveProperty('addOptimistic');
    expect(result.current).toHaveProperty('mergeChat');
    expect(result.current).toHaveProperty('reload');

    expect(Array.isArray(result.current.chatLog)).toBe(true);
    expect(typeof result.current.setChatLog).toBe('function');
    expect(typeof result.current.addOptimistic).toBe('function');
    expect(typeof result.current.mergeChat).toBe('function');
    expect(typeof result.current.reload).toBe('function');
  });

  describe('初期ロードと Realtime の整合性', () => {
    it('ロード中に届いた Realtime 発言を取得結果で上書きしない', async () => {
      let resolveLoad: (logs: Chat[]) => void = () => {};
      loadRecentChatLogsMock.mockReturnValue(
        new Promise<Chat[]>((resolve) => {
          resolveLoad = resolve;
        })
      );

      const { result } = renderHook(() => useChatLog('superbeginner'));

      // 初期ロードの解決前に Realtime で新着が届く
      const remote = makeChat({ uuid: 'remote-1', time: 2_000, message: 'こんばんは' });
      act(() => emitRealtime(remote));
      expect(result.current.chatLog.map((c) => c.uuid)).toEqual(['remote-1']);

      // 遅れて届いた初期ロード結果に remote-1 は含まれていない
      const older = makeChat({ uuid: 'older-1', time: 1_000, message: 'こんにちは' });
      await act(async () => {
        resolveLoad([older]);
      });

      await waitFor(() =>
        expect(result.current.chatLog.map((c) => c.uuid)).toEqual(['remote-1', 'older-1'])
      );
    });

    // 回帰テスト: 購読と取得を同じ effect にまとめていた頃は、更新のたびに
    // room 共有の channel を破棄・再作成していた。subscribeChatLogs は SUBSCRIBED を
    // 待たずに返るため、その再接続中に INSERT された発言を取りこぼす
    it('reload しても購読を張り直さない', async () => {
      loadRecentChatLogsMock.mockResolvedValue([]);
      loadChatLogsMock.mockResolvedValue([]);

      const { result } = renderHook(() => useChatLog('superbeginner'));

      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(1));
      expect(subscribeChatLogsMock).toHaveBeenCalledTimes(1);
      const unsubscribe = subscribeChatLogsMock.mock.results[0].value.unsubscribe;

      await act(async () => {
        result.current.reload();
      });

      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(2));
      // 取得は再実行されるが、購読は張り直されない
      expect(subscribeChatLogsMock).toHaveBeenCalledTimes(1);
      expect(unsubscribe).not.toHaveBeenCalled();
    });

    it('reload 中に届いた Realtime 発言も取得結果とマージする', async () => {
      let resolveReload: (logs: Chat[]) => void = () => {};
      loadRecentChatLogsMock.mockResolvedValueOnce([]);

      const { result } = renderHook(() => useChatLog('superbeginner'));
      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(1));

      loadRecentChatLogsMock.mockReturnValueOnce(
        new Promise<Chat[]>((resolve) => {
          resolveReload = resolve;
        })
      );
      await act(async () => {
        result.current.reload();
      });

      // 再取得の解決前に届いた発言
      const remote = makeChat({ uuid: 'remote-2', time: 3_000, message: 'やっほー' });
      act(() => emitRealtime(remote));

      const older = makeChat({ uuid: 'older-2', time: 1_500, message: 'ただいま' });
      await act(async () => {
        resolveReload([older]);
      });

      await waitFor(() =>
        expect(result.current.chatLog.map((c) => c.uuid)).toEqual(['remote-2', 'older-2'])
      );
    });

    // subscribeChatLogs は SUBSCRIBED を待たずに返るため、snapshot がサーバーで確定して
    // から接続が確立するまでに INSERT された発言は snapshot にもバッファにも入らない。
    // 接続確立時に一度だけ取り直して塞ぐ (初回描画は待たせない)。
    it('SUBSCRIBED 到達時にキャッシュを迂回して取り直す', async () => {
      loadRecentChatLogsMock.mockResolvedValue([]);

      renderHook(() => useChatLog('superbeginner'));
      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(1));
      // 初回取得は接続を待たずに始まる
      expect(loadRecentChatLogsMock).toHaveBeenNthCalledWith(1, 'superbeginner', 10);

      await act(async () => {
        emitStatus('connected');
      });

      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(2));
      // 取り直しで購読を張り直さない
      expect(subscribeChatLogsMock).toHaveBeenCalledTimes(1);
    });

    it('接続したままなら重ねて取り直さない', async () => {
      loadRecentChatLogsMock.mockResolvedValue([]);

      renderHook(() => useChatLog('superbeginner'));
      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(1));

      await act(async () => {
        emitStatus('connected');
      });
      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(2));

      await act(async () => {
        emitStatus('connected');
        emitStatus('connected');
      });

      expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(2);
    });

    // 切断中の発言は Postgres Changes では再配送されないため、復帰時の取り直しが
    // 唯一の回復手段になる (通常チャットにはポーリングがない)
    it('再接続のたびに取り直して切断中の取りこぼしを回復する', async () => {
      loadRecentChatLogsMock.mockResolvedValue([]);

      renderHook(() => useChatLog('superbeginner'));
      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(1));

      await act(async () => {
        emitStatus('connected');
      });
      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(2));

      await act(async () => {
        emitStatus('disconnected');
      });
      expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(2);

      await act(async () => {
        emitStatus('connected');
      });

      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(3));
      expect(subscribeChatLogsMock).toHaveBeenCalledTimes(1);
    });

    // 初期表示は少量取得 (常に実取得) なので、TTL キャッシュの迂回は
    // 入室後の全件取得の経路で検証する
    it('入室後の reload は TTL キャッシュを迂回して取り直す', async () => {
      loadRecentChatLogsMock.mockResolvedValue([]);
      loadChatLogsMock.mockResolvedValue([]);

      const { result } = renderHook(() => useChatLog('superbeginner'));
      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(1));

      await act(async () => {
        result.current.expandChatLog();
      });
      await waitFor(() => expect(loadChatLogsMock).toHaveBeenCalledWith('superbeginner', true));

      await act(async () => {
        result.current.reload();
      });

      await waitFor(() => expect(loadChatLogsMock).toHaveBeenCalledWith('superbeginner', false));
    });

    // 初期表示を軽くするため、入室前は 10 件だけ取得する
    it('初期表示は 10 件、入室で全件へ広げる', async () => {
      loadRecentChatLogsMock.mockResolvedValue([]);
      loadChatLogsMock.mockResolvedValue([]);

      const { result } = renderHook(() => useChatLog('superbeginner'));

      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenCalledWith('superbeginner', 10));
      expect(loadChatLogsMock).not.toHaveBeenCalled();

      await act(async () => {
        result.current.expandChatLog();
      });

      await waitFor(() => expect(loadChatLogsMock).toHaveBeenCalledWith('superbeginner', true));
      // 広げたあとに重ねて呼ばれない
      await act(async () => {
        result.current.expandChatLog();
      });
      expect(loadChatLogsMock).toHaveBeenCalledTimes(1);
    });
  });

  it('prepends a temp optimistic chat to the base state', () => {
    const tempChat: Chat = {
      uuid: 'temp-1',
      name: 'Taro',
      color: '#f00',
      message: 'Hello',
      time: 1_700_000_000_000,
      client_time: 1_700_000_000_000,
      ip_masked: 'test-ip',
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
      ip_masked: 'test-ip',
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
        ip_masked: 'test-ip',
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
      ip_masked: 'test-ip',
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
        ip_masked: 'test-ip',
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
        ip_masked: 'test-ip',
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
        ip_masked: 'test-ip',
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
        ip_masked: 'test-ip',
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
        ip_masked: 'test-ip',
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
