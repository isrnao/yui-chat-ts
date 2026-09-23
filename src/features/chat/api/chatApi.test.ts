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
    ip_masked: '',
    ua: '',
  };
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
    expect(typeof chatApi.loadRecentChatLogs).toBe('function');
    expect(typeof chatApi.saveChatLogOptimistic).toBe('function');
    expect(typeof chatApi.clearChatLogsByName).toBe('function');
    expect(typeof chatApi.subscribeChatLogs).toBe('function');
  });

  it('本番で使っていない関数をエクスポートしない', async () => {
    const chatApi: Record<string, unknown> = await import('./chatApi');
    for (const name of [
      'loadChatLogsWithPaging',
      'loadInitialChatLogs',
      'saveChatLog',
      'invalidateCacheAsync',
      'loadChatLogsByTimeRange',
      'clearChatLogs',
      'getCacheInfo',
      'prefetchChatLogs',
      'getSnapshotHasMore',
    ]) {
      expect(chatApi[name]).toBeUndefined();
    }
  });

  describe('loadChatRanking', () => {
    function createRankingQueryMock(rows: unknown[]) {
      const result = { data: rows, error: null };
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
      };
      return query;
    }

    it('chat_ranking ビューを部屋で絞って読み、RankingEntry に変換する', async () => {
      const { supabase } = await import('@shared/supabaseClient');
      const from = supabase.from as Mock;
      from.mockReset();
      const query = createRankingQueryMock([
        { name: '常連', post_count: 1200, last_time: 50, color: '#f00', host: '203.*.*.9' },
        { name: '新人', post_count: 3, last_time: 90, color: '#00f', host: null },
      ]);
      from.mockReturnValue(query);

      const chatApi = await import('./chatApi');
      const ranking = await chatApi.loadChatRanking(ROOM_ID);

      // 表示用ログ (chats の直近分) ではなく集計ビューを読む
      expect(from).toHaveBeenCalledWith('chat_ranking');
      expect(query.eq).toHaveBeenCalledWith('room_id', ROOM_ID);
      // deleted では絞らない (論理削除された発言も数える)
      expect(query.eq).not.toHaveBeenCalledWith('deleted', expect.anything());
      expect(ranking).toEqual([
        { name: '常連', count: 1200, lastTime: 50, color: '#f00', host: '203.*.*.9' },
        { name: '新人', count: 3, lastTime: 90, color: '#00f', host: '' },
      ]);
    });

    it('同数なら最終発言が新しい順に並べる', async () => {
      const { supabase } = await import('@shared/supabaseClient');
      const from = supabase.from as Mock;
      from.mockReset();
      from.mockReturnValue(
        createRankingQueryMock([
          { name: '古い', post_count: 5, last_time: 10, color: '#000', host: '' },
          { name: '新しい', post_count: 5, last_time: 20, color: '#000', host: '' },
        ])
      );

      const chatApi = await import('./chatApi');
      const ranking = await chatApi.loadChatRanking(ROOM_ID);

      expect(ranking.map((r) => r.name)).toEqual(['新しい', '古い']);
    });
  });

  describe('saveChatLogOptimistic', () => {
    it('save-chat Edge Function を呼び、ip / ua をペイロードに含めない', async () => {
      const { supabase } = await import('@shared/supabaseClient');
      const invoke = supabase.functions.invoke as Mock;
      invoke.mockReset();
      invoke.mockResolvedValue({
        data: { uuid: 'server-uuid', room_id: ROOM_ID, time: 12345 },
        error: null,
      });

      const chatApi = await import('./chatApi');
      const chat: Chat = {
        ...makeChat(1),
        ip_masked: '203.0.113.9', // クライアント由来の ip/ua は送信されないことを検証する
        ua: 'evil-agent',
        metadata: { version: 1, optimisticNonce: 'nonce-1' },
      };

      const saved = await chatApi.saveChatLogOptimistic(ROOM_ID, chat);

      // Edge Function 経由で保存される
      expect(invoke).toHaveBeenCalledTimes(1);
      const [fnName, options] = invoke.mock.calls[0];
      expect(fnName).toBe('save-chat');

      // ip / ua / uuid / time はペイロードに含めない（サーバーが確定する）
      const body = options.body;
      expect(body).not.toHaveProperty('ip');
      expect(body).not.toHaveProperty('ua');
      expect(body).not.toHaveProperty('uuid');
      expect(body).not.toHaveProperty('time');
      // metadata（optimisticNonce 含む）はそのまま渡し Realtime echo の突合を維持する
      expect(body.metadata).toEqual({ version: 1, optimisticNonce: 'nonce-1' });

      // サーバー生成の uuid / time が反映される
      expect(saved.uuid).toBe('server-uuid');
      expect(saved.time).toBe(12345);
      expect(saved.optimistic).toBe(false);
    });

    it('Edge Function が返した ip_masked / ua を保存結果に反映する', async () => {
      const { supabase } = await import('@shared/supabaseClient');
      const invoke = supabase.functions.invoke as Mock;
      invoke.mockReset();
      invoke.mockResolvedValue({
        data: {
          uuid: 'server-uuid',
          room_id: ROOM_ID,
          time: 12345,
          ip_masked: '203.0.113.*',
          ua: 'server-observed-ua',
        },
        error: null,
      });

      const chatApi = await import('./chatApi');
      const saved = await chatApi.saveChatLogOptimistic(ROOM_ID, makeChat(1));

      // 楽観行は ip_masked / ua が空。サーバー観測値で確定させないと、realtime INSERT が
      // 先に届いた場合に後着の HTTP 応答が空値で上書きしてしまう。
      expect(saved.ip_masked).toBe('203.0.113.*');
      expect(saved.ua).toBe('server-observed-ua');
    });

    it('Edge Function が ip_masked / ua を返さない場合は元の値を保つ', async () => {
      const { supabase } = await import('@shared/supabaseClient');
      const invoke = supabase.functions.invoke as Mock;
      invoke.mockReset();
      invoke.mockResolvedValue({
        data: { uuid: 'server-uuid', room_id: ROOM_ID, time: 12345 },
        error: null,
      });

      const chatApi = await import('./chatApi');
      const saved = await chatApi.saveChatLogOptimistic(ROOM_ID, {
        ...makeChat(1),
        ip_masked: '198.51.100.*',
        ua: 'existing-ua',
      });

      expect(saved.ip_masked).toBe('198.51.100.*');
      expect(saved.ua).toBe('existing-ua');
    });

    it('送信操作の ID と試行番号をヘッダーで送る（ID は渡された値、省略時は発行）', async () => {
      const { supabase } = await import('@shared/supabaseClient');
      const invoke = supabase.functions.invoke as Mock;
      invoke.mockReset();
      invoke.mockResolvedValue({
        data: { uuid: 'server-uuid', room_id: ROOM_ID, time: 1 },
        error: null,
      });

      const chatApi = await import('./chatApi');
      await chatApi.saveChatLogOptimistic(ROOM_ID, makeChat(1), { operationId: 'op-from-hook' });
      await chatApi.saveChatLogOptimistic(ROOM_ID, makeChat(2));
      await chatApi.saveChatLogOptimistic(ROOM_ID, makeChat(3));

      const [given, first, second] = invoke.mock.calls.map(([, options]) => options.headers);
      // フック（useChatSender.sendUserMessage）が発行した ID をそのまま送る
      expect(given['x-chat-operation-id']).toBe('op-from-hook');
      expect(given['x-chat-attempt']).toBe('1');
      // 省略時は UUID を発行し、送信ごとに別の ID になる
      expect(first['x-chat-operation-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(second['x-chat-operation-id']).not.toBe(first['x-chat-operation-id']);
    });

    it('crypto.randomUUID がない環境でも送信できる', async () => {
      const { supabase } = await import('@shared/supabaseClient');
      const invoke = supabase.functions.invoke as Mock;
      invoke.mockReset();
      invoke.mockResolvedValue({
        data: { uuid: 'server-uuid', room_id: ROOM_ID, time: 1 },
        error: null,
      });
      const original = crypto.randomUUID;
      // http で開いた検証環境や古い WebView を再現する
      Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
      try {
        const chatApi = await import('./chatApi');
        const saved = await chatApi.saveChatLogOptimistic(ROOM_ID, makeChat(1));
        expect(saved.uuid).toBe('server-uuid');
        const [, options] = invoke.mock.calls[0];
        expect(options.headers['x-chat-operation-id']).toMatch(/^[0-9a-f-]{36}$/);
      } finally {
        Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
      }
    });

    it('再試行しても操作 ID は同じで、試行番号だけが増える', async () => {
      const { supabase } = await import('@shared/supabaseClient');
      const invoke = supabase.functions.invoke as Mock;
      invoke.mockReset();
      invoke
        .mockResolvedValueOnce({ data: null, error: { message: 'temporary' } })
        .mockResolvedValueOnce({
          data: { uuid: 'server-uuid', room_id: ROOM_ID, time: 1 },
          error: null,
        });

      const chatApi = await import('./chatApi');
      await chatApi.saveChatLogOptimistic(ROOM_ID, makeChat(1));

      const headers = invoke.mock.calls.map(([, options]) => options.headers);
      expect(headers).toHaveLength(2);
      expect(headers[1]['x-chat-operation-id']).toBe(headers[0]['x-chat-operation-id']);
      expect(headers.map((h) => h['x-chat-attempt'])).toEqual(['1', '2']);
    });

    it('Edge Function がエラーを返したら例外を投げる', async () => {
      const { supabase } = await import('@shared/supabaseClient');
      const invoke = supabase.functions.invoke as Mock;
      invoke.mockReset();
      invoke.mockResolvedValue({ data: null, error: { message: 'boom' } });

      const chatApi = await import('./chatApi');
      await expect(chatApi.saveChatLogOptimistic(ROOM_ID, makeChat(1))).rejects.toThrow('boom');
    });
  });

  describe('clearChatLogsByName', () => {
    it('issues a logical delete (update deleted=true) scoped to the room and name', async () => {
      // Supabase クエリビルダのチェイン: .update().eq().eq() を辿って await されることを再現する。
      const eqName = vi.fn(() => Promise.resolve({ error: null }));
      const eqRoom = vi.fn(() => ({ eq: eqName }));
      const update = vi.fn(() => ({ eq: eqRoom }));

      const { supabase } = await import('@shared/supabaseClient');
      const from = supabase.from as Mock;
      from.mockReset();
      from.mockReturnValue({ update });

      const chatApi = await import('./chatApi');
      await chatApi.clearChatLogsByName(ROOM_ID, 'ゆい');

      // hard delete ではなく update({ deleted: true }) で呼ばれること
      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith({ deleted: true });
      // 部屋と名前で絞る
      expect(eqRoom).toHaveBeenCalledWith('room_id', ROOM_ID);
      expect(eqName).toHaveBeenCalledWith('name', 'ゆい');
    });

    it('throws when supabase reports an error', async () => {
      const eqName = vi.fn(() => Promise.resolve({ error: { message: 'boom', code: '42' } }));
      const eqRoom = vi.fn(() => ({ eq: eqName }));
      const update = vi.fn(() => ({ eq: eqRoom }));

      const { supabase } = await import('@shared/supabaseClient');
      const from = supabase.from as Mock;
      from.mockReset();
      from.mockReturnValue({ update });

      const chatApi = await import('./chatApi');
      await expect(chatApi.clearChatLogsByName(ROOM_ID, 'ゆい')).rejects.toThrow(/boom/);
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

  describe('subscribeChatLogs の接続状態通知', () => {
    async function setupRegistry() {
      const harness = installChannelMock();
      const { supabase } = await import('@shared/supabaseClient');
      (supabase as unknown as Record<string, unknown>).channel = harness.channel;
      (supabase as unknown as Record<string, unknown>).removeChannel = harness.removeChannel;
      return { harness, chatApi: await import('./chatApi') };
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
        ip_masked: '',
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
        ip_masked: '',
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
        ip_masked: '',
        ua: '',
      });

      expect(result.metadata?.version).toBe(1);
      expect(typeof result.metadata?.optimisticNonce).toBe('string');
    });
  });
});
