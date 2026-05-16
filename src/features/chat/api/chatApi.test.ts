import { beforeEach, describe, it, expect, vi, type Mock } from 'vitest';
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
    ip: '',
    ua: '',
  };
}

function createQueryMock(data: Chat[]) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => Promise.resolve({ data, error: null })),
  };

  return query;
}

describe('chatApi', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
    });
  });

  it('should export required functions', async () => {
    const chatApi = await import('./chatApi');

    // 必要な関数がエクスポートされていることを確認
    expect(typeof chatApi.loadChatLogs).toBe('function');
    expect(typeof chatApi.loadInitialChatLogs).toBe('function');
    expect(typeof chatApi.saveChatLog).toBe('function');
    expect(typeof chatApi.clearChatLogs).toBe('function');
    expect(typeof chatApi.subscribeChatLogs).toBe('function');
  });

  it('reports hasMore=true when the snapshot is capped (table has more than MAX_CHAT_LOG rows)', async () => {
    // chatLogResource は MAX_CHAT_LOG + 1 件を要求し、超過の有無で hasMore を判定する。
    // ここでは 101 件の mock を返し、「table にさらに続きがある」状況を再現する。
    const { supabase } = await import('@shared/supabaseClient');
    const from = supabase.from as Mock;
    from.mockReset();
    from.mockReturnValue(
      createQueryMock(Array.from({ length: 101 }, (_, index) => makeChat(index)))
    );

    const chatApi = await import('./chatApi');
    const result = await chatApi.loadChatLogsWithPaging(ROOM_ID, 100, 0, true);

    // 超過分は表示・キャッシュに含めずに 100 件へ trim する
    expect(result.data).toHaveLength(100);
    expect(result.hasMore).toBe(true);
  });

  it('reports hasMore=false when the snapshot does not reach MAX_CHAT_LOG', async () => {
    const { supabase } = await import('@shared/supabaseClient');
    const from = supabase.from as Mock;
    from.mockReset();
    from.mockReturnValue(
      createQueryMock(Array.from({ length: 80 }, (_, index) => makeChat(index)))
    );

    const chatApi = await import('./chatApi');
    const result = await chatApi.loadChatLogsWithPaging(ROOM_ID, 100, 0, true);

    expect(result.data).toHaveLength(80);
    expect(result.hasMore).toBe(false);
  });

  describe('clearChatLogs', () => {
    it('issues a logical delete (update deleted=true) scoped to the room', async () => {
      // Supabase クエリビルダのチェイン: .update().eq().eq() を辿って await されることを再現する。
      const eqDeleted = vi.fn(() => Promise.resolve({ error: null }));
      const eqRoom = vi.fn(() => ({ eq: eqDeleted }));
      const update = vi.fn(() => ({ eq: eqRoom }));

      const { supabase } = await import('@shared/supabaseClient');
      const from = supabase.from as Mock;
      from.mockReset();
      from.mockReturnValue({ update });

      const chatApi = await import('./chatApi');
      await chatApi.clearChatLogs(ROOM_ID);

      // hard delete ではなく update({ deleted: true }) で呼ばれること
      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith({ deleted: true });
      // room_id 一致 → deleted=false 一致 でフィルタされる (再削除や既消し行への二重 update を防ぐ)
      expect(eqRoom).toHaveBeenCalledWith('room_id', ROOM_ID);
      expect(eqDeleted).toHaveBeenCalledWith('deleted', false);
    });

    it('throws when supabase reports an error', async () => {
      const eqDeleted = vi.fn(() => Promise.resolve({ error: { message: 'boom', code: '42' } }));
      const eqRoom = vi.fn(() => ({ eq: eqDeleted }));
      const update = vi.fn(() => ({ eq: eqRoom }));

      const { supabase } = await import('@shared/supabaseClient');
      const from = supabase.from as Mock;
      from.mockReset();
      from.mockReturnValue({ update });

      const chatApi = await import('./chatApi');
      await expect(chatApi.clearChatLogs(ROOM_ID)).rejects.toThrow(/boom/);
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
      subscribe: vi.fn(() => channelInstance),
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

      const chatApi = await import('./chatApi');
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

      const chatApi = await import('./chatApi');
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

  describe('broadcast send-only channel cleanup', () => {
    it('removes the channel after a send when no listener is attached', async () => {
      const harness = installChannelMock();
      const { supabase } = await import('@shared/supabaseClient');
      (supabase as unknown as Record<string, unknown>).channel = harness.channel;
      (supabase as unknown as Record<string, unknown>).removeChannel = harness.removeChannel;

      const chatApi = await import('./chatApi');
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

      const chatApi = await import('./chatApi');
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

      const chatApi = await import('./chatApi');
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

  describe('createOptimisticChat', () => {
    it('attaches a fresh optimisticNonce while preserving caller-supplied metadata', async () => {
      const chatApi = await import('./chatApi');
      const result = chatApi.createOptimisticChat({
        room_id: ROOM_ID,
        name: 'Taro',
        color: '#f00',
        message: 'Hello',
        client_time: 0, // overwritten by helper
        ip: '',
        ua: '',
        metadata: { version: 1, fontStyle: { bold: true } },
      });

      expect(result.uuid.startsWith('temp-')).toBe(true);
      expect(result.optimistic).toBe(true);
      expect(typeof result.client_time).toBe('number');
      // time は先頭表示保証用に +1 年シフトされている
      expect(result.time).toBeGreaterThan((result.client_time ?? 0) + 300 * 24 * 60 * 60 * 1000);
      expect(result.metadata?.fontStyle).toEqual({ bold: true });
      expect(typeof result.metadata?.optimisticNonce).toBe('string');
      expect((result.metadata?.optimisticNonce ?? '').length).toBeGreaterThan(0);
    });

    it('generates a unique nonce per call', async () => {
      const chatApi = await import('./chatApi');
      const base = {
        room_id: ROOM_ID,
        name: 'Taro',
        color: '#f00',
        message: 'Hello',
        client_time: 0,
        ip: '',
        ua: '',
      };
      const a = chatApi.createOptimisticChat(base);
      const b = chatApi.createOptimisticChat(base);

      expect(a.metadata?.optimisticNonce).toBeDefined();
      expect(b.metadata?.optimisticNonce).toBeDefined();
      expect(a.metadata?.optimisticNonce).not.toBe(b.metadata?.optimisticNonce);
    });

    it('synthesizes a default metadata object when none is provided', async () => {
      const chatApi = await import('./chatApi');
      const result = chatApi.createOptimisticChat({
        room_id: ROOM_ID,
        name: 'Taro',
        color: '#f00',
        message: 'Hello',
        client_time: 0,
        ip: '',
        ua: '',
      });

      expect(result.metadata?.version).toBe(1);
      expect(typeof result.metadata?.optimisticNonce).toBe('string');
    });
  });
});
