import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { Chat } from '@features/chat/types';
import type { RealtimeStatus } from '@features/chat/api/chatApi';
import { useChatLog } from '@features/chat/hooks/useChatLog';
import { useReloadInterval } from './useReloadInterval';

// ChanariChatPage と同じ配線を再現し、実際の取得回数を数える。
// Realtime が届いている間はポーリングしない（= 無駄な問い合わせを出さない）ことの回帰テスト。
const { loadChatLogsMock, subscribeChatLogsMock, emitStatus } = vi.hoisted(() => {
  const statusListeners = new Set<(s: RealtimeStatus) => void>();
  return {
    loadChatLogsMock: vi.fn(),
    subscribeChatLogsMock: vi.fn(
      (_roomId: string, _cb: (c: Chat) => void, onStatus?: (s: RealtimeStatus) => void) => {
        if (onStatus) statusListeners.add(onStatus);
        return {
          unsubscribe: () => {
            if (onStatus) statusListeners.delete(onStatus);
          },
        };
      }
    ),
    emitStatus: (s: RealtimeStatus) => {
      for (const l of statusListeners) l(s);
    },
  };
});

vi.mock('@features/chat/api/chatApi', () => ({
  loadChatLogs: loadChatLogsMock,
  subscribeChatLogs: subscribeChatLogsMock,
}));

/** ChanariChatPage の配線: 切断中だけ定期更新を回す */
function useChanariWiring(seconds: number) {
  const { realtimeStatus, reload } = useChatLog('durarara');
  useReloadInterval(seconds, reload, realtimeStatus === 'disconnected');
  return realtimeStatus;
}

describe('ちゃなりの定期更新フォールバック', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadChatLogsMock.mockResolvedValue([]);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function advance(seconds: number) {
    for (let i = 0; i < seconds / 7; i++) {
      await act(async () => {
        vi.advanceTimersByTime(7_000);
        await Promise.resolve();
      });
    }
  }

  it('Realtime 接続中は 60 秒経ってもポーリングしない', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useChanariWiring(7));

    await act(async () => {
      emitStatus('connected');
      await Promise.resolve();
    });
    expect(result.current).toBe('connected');

    await advance(63);

    // 初回ロードの 1 回だけ。7 秒ごとの取得は走らない
    expect(loadChatLogsMock).toHaveBeenCalledTimes(1);
    expect(loadChatLogsMock).toHaveBeenCalledWith('durarara', true);
  });

  it('Realtime が切れている間はフォールバックとしてポーリングする', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useChanariWiring(7));

    await act(async () => {
      emitStatus('disconnected');
      await Promise.resolve();
    });
    expect(result.current).toBe('disconnected');

    await advance(21);

    // 初回 + 7 秒ごとの 3 回
    expect(loadChatLogsMock).toHaveBeenCalledTimes(4);
  });

  it('復帰したらポーリングを止める', async () => {
    vi.useFakeTimers();
    renderHook(() => useChanariWiring(7));

    await act(async () => {
      emitStatus('disconnected');
      await Promise.resolve();
    });
    await advance(14);
    const whileDown = loadChatLogsMock.mock.calls.length;
    expect(whileDown).toBeGreaterThan(1);

    await act(async () => {
      emitStatus('connected');
      await Promise.resolve();
    });
    await advance(63);

    expect(loadChatLogsMock).toHaveBeenCalledTimes(whileDown);
  });
});
