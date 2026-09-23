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

describe('saveChat', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
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

      const chatApi = await import('./saveChat');
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

      const chatApi = await import('./saveChat');
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

      const chatApi = await import('./saveChat');
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

      const chatApi = await import('./saveChat');
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
        const chatApi = await import('./saveChat');
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

      const chatApi = await import('./saveChat');
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

      const chatApi = await import('./saveChat');
      await expect(chatApi.saveChatLogOptimistic(ROOM_ID, makeChat(1))).rejects.toThrow('boom');
    });
  });

  describe('createOptimisticChat', () => {
    it('attaches a fresh optimisticNonce while preserving caller-supplied metadata', async () => {
      const chatApi = await import('./saveChat');
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
      const chatApi = await import('./saveChat');
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
      const chatApi = await import('./saveChat');
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
