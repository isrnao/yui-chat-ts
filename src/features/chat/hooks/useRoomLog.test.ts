import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useRoomLog } from './useRoomLog';
import { getRoomLogStore, FULL_CHAT_LOG_LIMIT } from '@features/chat/api/roomLogStore';
import type { RoomId } from '@features/chat/rooms';
import type { Chat } from '@features/chat/types';

// Supabaseとの統合、useOptimistic、リアルタイム機能が複雑になったため
// 基本的なインターフェーステストのみに簡略化

// APIモック
const {
  loadRecentChatLogsMock,
  subscribeChatLogsMock,
  emitRealtime,
  emitStatus,
  clearRealtimeListeners,
} = vi.hoisted(() => {
  const listeners = new Set<(chat: Chat) => void>();
  const statusListeners = new Set<(status: 'connecting' | 'connected' | 'disconnected') => void>();
  return {
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

vi.mock('@features/chat/api/chatQueries', () => ({
  loadRecentChatLogs: loadRecentChatLogsMock,
}));
vi.mock('@features/chat/api/realtime', () => ({
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

/** 以前の useChatLog(roomId) と同じ配線: 部屋の store を読む */
function useChatLog(roomId: RoomId = 'superbeginner') {
  return useRoomLog(getRoomLogStore(roomId));
}

describe('useRoomLog（部屋単位の store）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRealtimeListeners();
    loadRecentChatLogsMock.mockReturnValue(new Promise<never>(() => {}));
  });

  it('should initialize and return expected interface', () => {
    const { result } = renderHook(() => useChatLog());

    // フックが期待されるインターフェースを返すことのみをテスト
    expect(Array.isArray(result.current.chatLog)).toBe(true);
    expect(result.current.isLoading).toBe(true);
    expect(typeof result.current.addOptimistic).toBe('function');
    expect(typeof result.current.reload).toBe('function');
    expect(typeof result.current.expand).toBe('function');
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
    it('SUBSCRIBED 到達時に取り直す', async () => {
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

    it('入室後の reload は広げた件数で取り直す', async () => {
      loadRecentChatLogsMock.mockResolvedValue([]);

      const { result } = renderHook(() => useChatLog('superbeginner'));
      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(1));

      await act(async () => {
        result.current.expand(FULL_CHAT_LOG_LIMIT);
      });
      await waitFor(() =>
        expect(loadRecentChatLogsMock).toHaveBeenLastCalledWith('superbeginner', 100)
      );

      await act(async () => {
        result.current.reload();
      });

      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(3));
      expect(loadRecentChatLogsMock).toHaveBeenLastCalledWith('superbeginner', 100);
    });

    it('100 件より多く広げると、その件数を直接取得して既存の発言を残す', async () => {
      const existing = makeChat({ uuid: 'old', time: 1 });
      loadRecentChatLogsMock.mockResolvedValue([existing]);

      const { result } = renderHook(() => useChatLog('com_sb'));
      await waitFor(() => expect(result.current.chatLog).toHaveLength(1));

      await act(async () => {
        result.current.expand(FULL_CHAT_LOG_LIMIT);
      });
      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenLastCalledWith('com_sb', 100));

      const older = makeChat({ uuid: 'older', time: 0 });
      loadRecentChatLogsMock.mockResolvedValueOnce([existing, older]);
      await act(async () => {
        result.current.expand(1000);
      });

      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenLastCalledWith('com_sb', 1000));
      await waitFor(() => expect(result.current.chatLog).toHaveLength(2));
    });

    it('取得件数は減らす方向には戻さない', async () => {
      loadRecentChatLogsMock.mockResolvedValue([]);

      const { result } = renderHook(() => useChatLog('com_sb'));
      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(1));

      await act(async () => {
        result.current.expand(1000);
      });
      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(2));

      await act(async () => {
        result.current.expand(30);
      });

      expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(2);
    });

    // 初回取得が進行中のうちに接続が確立しても、snapshot 確定〜SUBSCRIBED の発言を
    // 取りこぼさないよう、もう一度サーバーへ問い合わせる
    it('取得中に接続が確立したら、もう一度取得する', async () => {
      loadRecentChatLogsMock.mockReturnValue(new Promise<Chat[]>(() => {}));

      renderHook(() => useChatLog('superbeginner'));
      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(1));
      expect(loadRecentChatLogsMock).toHaveBeenNthCalledWith(1, 'superbeginner', 10);

      await act(async () => {
        emitStatus('connected');
      });

      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(2));
      expect(loadRecentChatLogsMock).toHaveBeenNthCalledWith(2, 'superbeginner', 10);
    });

    // 毎回 previous をマージすると、別クライアントで論理削除された発言や
    // 最新 100 件から外れた発言がいつまでも残る
    it('通常の取り直しでは取得結果に無い発言を残さない', async () => {
      const stale = makeChat({ uuid: 'stale-1', time: 1_000, message: '消された発言' });
      const fresh = makeChat({ uuid: 'fresh-1', time: 2_000, message: '残る発言' });
      loadRecentChatLogsMock.mockResolvedValueOnce([stale, fresh]);

      const { result } = renderHook(() => useChatLog('superbeginner'));
      await waitFor(() => expect(result.current.chatLog).toHaveLength(2));

      // 取り直しの結果から stale-1 が消えている
      loadRecentChatLogsMock.mockResolvedValueOnce([fresh]);
      await act(async () => {
        result.current.reload();
      });

      await waitFor(() => expect(result.current.chatLog.map((c) => c.uuid)).toEqual(['fresh-1']));
    });

    // 初期表示を軽くするため、入室前は 10 件だけ取得する
    it('初期表示は 10 件、入室で全件へ広げる', async () => {
      loadRecentChatLogsMock.mockResolvedValue([]);

      const { result } = renderHook(() => useChatLog('superbeginner'));

      await waitFor(() => expect(loadRecentChatLogsMock).toHaveBeenCalledWith('superbeginner', 10));

      await act(async () => {
        result.current.expand(FULL_CHAT_LOG_LIMIT);
      });

      await waitFor(() =>
        expect(loadRecentChatLogsMock).toHaveBeenLastCalledWith('superbeginner', 100)
      );
      // 広げたあとに重ねて呼ばれない
      await act(async () => {
        result.current.expand(FULL_CHAT_LOG_LIMIT);
      });
      expect(loadRecentChatLogsMock).toHaveBeenCalledTimes(2);
    });
  });
});
