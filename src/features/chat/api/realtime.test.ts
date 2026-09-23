import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { Chat } from '@features/chat/types';
import type { RoomId } from '../rooms';

// Supabaseとの統合テストは複雑なモックが必要なため、簡略化
// 実際の統合テストは手動またはE2Eテストで行う

const ROOM_ID: RoomId = 'superbeginner';

function makeChat(index: number): Chat {
  return {
    uuid: `chat-${index}`,
    room_id: ROOM_ID,
    name: `user-${index}`,
    color: '#000000',
    message: `message-${index}`,
    time: index,
    ip_masked: '',
    ua: '',
  };
}

describe('realtime', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
    });
  });

  /**
   * 再利用 helper: supabase.channel / removeChannel を差し替えて
   * 1 つの "channel instance" を返す。次回 channel() 呼び出しまでは
   * 同じインスタンスを共有することを呼び出し側で確認できる。
   */
  function installChannelMock() {
    const postgresListeners: Array<(payload: { new: unknown }) => void> = [];
    const broadcastListeners: Array<(payload: { payload: unknown }) => void> = [];
    const statusCallbacks: Array<(status: string) => void> = [];
    let pendingSend: { resolve: (value: string) => void } | null = null;

    const channelInstance = {
      on: vi.fn(
        (
          kind: string,
          filter: Record<string, unknown> | { event?: string },
          callback: (payload: unknown) => void
        ) => {
          if (kind === 'postgres_changes') {
            postgresListeners.push(callback as (payload: { new: unknown }) => void);
          } else if (kind === 'broadcast') {
            broadcastListeners.push(callback as (payload: { payload: unknown }) => void);
          }
          // 未使用引数を ESLint 警告から守るためのダミー参照
          void filter;
          return channelInstance;
        }
      ),
      subscribe: vi.fn((statusCallback?: (status: string) => void) => {
        if (statusCallback) statusCallbacks.push(statusCallback);
        return channelInstance;
      }),
      send: vi.fn(
        () =>
          new Promise<string>((resolve) => {
            pendingSend = { resolve };
          })
      ),
    };

    const channel = vi.fn(() => channelInstance);
    const removeChannel = vi.fn();

    return {
      channelInstance,
      channel,
      removeChannel,
      postgresListeners,
      broadcastListeners,
      /** supabase の subscribe status コールバックを発火させる */
      emitStatus: (status: string) => {
        for (const cb of statusCallbacks) cb(status);
      },
      /** 直近の channel.send 呼び出しの Promise を resolve する */
      resolvePendingSend() {
        pendingSend?.resolve('ok');
        pendingSend = null;
      },
    };
  }

  describe('subscribeChatLogs registry lifecycle', () => {
    it('shares a single channel across concurrent subscribes for the same room', async () => {
      const harness = installChannelMock();
      const { supabase } = await import('@shared/supabaseClient');
      (supabase as unknown as Record<string, unknown>).channel = harness.channel;
      (supabase as unknown as Record<string, unknown>).removeChannel = harness.removeChannel;

      const chatApi = await import('./realtime');
      const sub1 = chatApi.subscribeChatLogs(ROOM_ID, () => {});
      const sub2 = chatApi.subscribeChatLogs(ROOM_ID, () => {});

      // 同じ room 名で 2 回 subscribe しても supabase.channel は 1 回しか呼ばれない
      expect(harness.channel).toHaveBeenCalledTimes(1);
      expect(harness.channel).toHaveBeenCalledWith(`chats-postgres-${ROOM_ID}`);

      // 1 回目の unsubscribe では channel を破棄しない
      sub1.unsubscribe();
      expect(harness.removeChannel).not.toHaveBeenCalled();

      // 最後の unsubscribe で removeChannel が呼ばれて registry から消える
      sub2.unsubscribe();
      expect(harness.removeChannel).toHaveBeenCalledTimes(1);
      expect(harness.removeChannel).toHaveBeenCalledWith(harness.channelInstance);
    });

    it('dispatches realtime INSERT payloads to all attached listeners', async () => {
      const harness = installChannelMock();
      const { supabase } = await import('@shared/supabaseClient');
      (supabase as unknown as Record<string, unknown>).channel = harness.channel;
      (supabase as unknown as Record<string, unknown>).removeChannel = harness.removeChannel;

      const chatApi = await import('./realtime');
      const calls1: Chat[] = [];
      const calls2: Chat[] = [];
      const sub1 = chatApi.subscribeChatLogs(ROOM_ID, (chat) => calls1.push(chat));
      const sub2 = chatApi.subscribeChatLogs(ROOM_ID, (chat) => calls2.push(chat));

      const inserted = makeChat(1);
      // registry の on() は 1 度だけ呼ばれ、その中で内部 dispatch される設計
      harness.postgresListeners[0]({ new: inserted });

      expect(calls1).toHaveLength(1);
      expect(calls2).toHaveLength(1);
      expect(calls1[0].uuid).toBe(inserted.uuid);
      expect(calls2[0].uuid).toBe(inserted.uuid);

      sub1.unsubscribe();
      sub2.unsubscribe();
    });
  });

  describe('subscribeChatLogs の接続状態通知', () => {
    async function setupRegistry() {
      const harness = installChannelMock();
      const { supabase } = await import('@shared/supabaseClient');
      (supabase as unknown as Record<string, unknown>).channel = harness.channel;
      (supabase as unknown as Record<string, unknown>).removeChannel = harness.removeChannel;
      return { harness, chatApi: await import('./realtime') };
    }

    it('SUBSCRIBED / エラーを購読者へ伝える', async () => {
      const { harness, chatApi } = await setupRegistry();
      const seen: string[] = [];
      const sub = chatApi.subscribeChatLogs(
        ROOM_ID,
        () => {},
        (s) => seen.push(s)
      );

      harness.emitStatus('SUBSCRIBED');
      harness.emitStatus('CHANNEL_ERROR');
      harness.emitStatus('SUBSCRIBED');

      expect(seen).toEqual(['connected', 'disconnected', 'connected']);
      sub.unsubscribe();
    });

    it('同じ状態が続いても重複通知しない', async () => {
      const { harness, chatApi } = await setupRegistry();
      const seen: string[] = [];
      const sub = chatApi.subscribeChatLogs(
        ROOM_ID,
        () => {},
        (s) => seen.push(s)
      );

      harness.emitStatus('SUBSCRIBED');
      harness.emitStatus('SUBSCRIBED');
      harness.emitStatus('TIMED_OUT');
      harness.emitStatus('CLOSED');

      expect(seen).toEqual(['connected', 'disconnected']);
      sub.unsubscribe();
    });

    it('接続済み channel に後から加わった購読者へも現在の状態を伝える', async () => {
      const { harness, chatApi } = await setupRegistry();
      const first = chatApi.subscribeChatLogs(ROOM_ID, () => {});
      harness.emitStatus('SUBSCRIBED');

      const seen: string[] = [];
      const second = chatApi.subscribeChatLogs(
        ROOM_ID,
        () => {},
        (s) => seen.push(s)
      );

      // 同期では通知せず (呼び出し元 effect 内の同期 setState を避ける)、microtask で届く
      expect(seen).toEqual([]);
      await Promise.resolve();
      expect(seen).toEqual(['connected']);

      first.unsubscribe();
      second.unsubscribe();
    });

    it('解除後は状態を通知しない', async () => {
      const { harness, chatApi } = await setupRegistry();
      const seen: string[] = [];
      const sub = chatApi.subscribeChatLogs(
        ROOM_ID,
        () => {},
        (s) => seen.push(s)
      );
      sub.unsubscribe();

      harness.emitStatus('SUBSCRIBED');
      await Promise.resolve();

      expect(seen).toEqual([]);
    });
  });

  describe('broadcast send-only channel cleanup', () => {
    it('removes the channel after a send when no listener is attached', async () => {
      const harness = installChannelMock();
      const { supabase } = await import('@shared/supabaseClient');
      (supabase as unknown as Record<string, unknown>).channel = harness.channel;
      (supabase as unknown as Record<string, unknown>).removeChannel = harness.removeChannel;

      const chatApi = await import('./realtime');
      chatApi.broadcastLookEvent(ROOM_ID, 'msg-1');

      expect(harness.channel).toHaveBeenCalledWith(`chats-broadcast-${ROOM_ID}`);
      expect(harness.removeChannel).not.toHaveBeenCalled();

      // send が解決した後に cleanup が走る
      harness.resolvePendingSend();
      await Promise.resolve();
      await Promise.resolve();

      expect(harness.removeChannel).toHaveBeenCalledTimes(1);
      expect(harness.removeChannel).toHaveBeenCalledWith(harness.channelInstance);
    });

    it('keeps the channel when an active listener is attached', async () => {
      const harness = installChannelMock();
      const { supabase } = await import('@shared/supabaseClient');
      (supabase as unknown as Record<string, unknown>).channel = harness.channel;
      (supabase as unknown as Record<string, unknown>).removeChannel = harness.removeChannel;

      const chatApi = await import('./realtime');
      const unsub = chatApi.onLookBroadcast(ROOM_ID, () => {});

      chatApi.broadcastLookEvent(ROOM_ID, 'msg-1');
      harness.resolvePendingSend();
      await Promise.resolve();
      await Promise.resolve();

      // listener が居る間は send 完了後も channel を維持する
      expect(harness.removeChannel).not.toHaveBeenCalled();

      // listener 解除で初めて removeChannel が走る
      unsub();
      expect(harness.removeChannel).toHaveBeenCalledTimes(1);
    });

    it('does not remove the channel when a listener is added between send call and send completion', async () => {
      const harness = installChannelMock();
      const { supabase } = await import('@shared/supabaseClient');
      (supabase as unknown as Record<string, unknown>).channel = harness.channel;
      (supabase as unknown as Record<string, unknown>).removeChannel = harness.removeChannel;

      const chatApi = await import('./realtime');
      // listener=0 で send 開始 → finally 内で hadListeners=false が記録される
      chatApi.broadcastLookEvent(ROOM_ID, 'msg-1');
      // 送信完了前に listener が登録されると、cleanup は size>0 を見て maintain する
      const unsub = chatApi.onLookBroadcast(ROOM_ID, () => {});

      harness.resolvePendingSend();
      await Promise.resolve();
      await Promise.resolve();

      expect(harness.removeChannel).not.toHaveBeenCalled();
      unsub();
      expect(harness.removeChannel).toHaveBeenCalledTimes(1);
    });
  });
});
