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

describe('chatQueries', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      configurable: true,
    });
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

      const chatApi = await import('./chatQueries');
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

      const chatApi = await import('./chatQueries');
      const ranking = await chatApi.loadChatRanking(ROOM_ID);

      expect(ranking.map((r) => r.name)).toEqual(['新しい', '古い']);
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

      const chatApi = await import('./chatQueries');
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

      const chatApi = await import('./chatQueries');
      await expect(chatApi.clearChatLogsByName(ROOM_ID, 'ゆい')).rejects.toThrow(/boom/);
    });
  });

  describe('loadRecentChatLogs', () => {
    function queryMock(result: {
      data: Chat[] | null;
      error: null | { message: string; code: string };
    }) {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => Promise.resolve(result)),
      };
      return query;
    }

    it('部屋と論理削除で絞り、uuid の降順で limit 件を取得する。ip の生値は取得しない', async () => {
      const { supabase } = await import('@shared/supabaseClient');
      const query = queryMock({ data: [makeChat(1)], error: null });
      (supabase.from as Mock).mockReset().mockReturnValue(query);

      const { loadRecentChatLogs } = await import('./chatQueries');
      await expect(loadRecentChatLogs(ROOM_ID, 30)).resolves.toHaveLength(1);

      const columns = (query.select.mock.calls[0] as unknown as [string])[0].split(',');
      expect(columns).toEqual(expect.arrayContaining(['ip_masked', 'ua', 'metadata']));
      expect(columns).not.toContain('ip');
      expect(query.eq).toHaveBeenCalledWith('room_id', ROOM_ID);
      expect(query.eq).toHaveBeenCalledWith('deleted', false);
      expect(query.order).toHaveBeenCalledWith('uuid', { ascending: false });
      expect(query.limit).toHaveBeenCalledWith(30);
    });

    it('呼ぶたびにサーバーへ問い合わせる（キャッシュを持たない）', async () => {
      const { supabase } = await import('@shared/supabaseClient');
      (supabase.from as Mock)
        .mockReset()
        .mockImplementation(() => queryMock({ data: [makeChat(1)], error: null }));

      const { loadRecentChatLogs } = await import('./chatQueries');
      await loadRecentChatLogs(ROOM_ID, 10);
      await loadRecentChatLogs(ROOM_ID, 10);
      expect(supabase.from).toHaveBeenCalledTimes(2);
    });

    it('オフラインのときは部屋の既定のログを返す', async () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      const { supabase } = await import('@shared/supabaseClient');
      (supabase.from as Mock).mockReset();

      const { loadRecentChatLogs } = await import('./chatQueries');
      const logs = await loadRecentChatLogs(ROOM_ID, 2);
      expect(logs).toHaveLength(2);
      expect(logs.every((c) => c.room_id === ROOM_ID)).toBe(true);
      expect(supabase.from).not.toHaveBeenCalled();
    });

    it('認証エラーのときは既定のログを返す', async () => {
      const { supabase } = await import('@shared/supabaseClient');
      (supabase.from as Mock)
        .mockReset()
        .mockReturnValue(queryMock({ data: null, error: { message: 'JWT expired', code: '401' } }));

      const { loadRecentChatLogs } = await import('./chatQueries');
      await expect(loadRecentChatLogs(ROOM_ID, 3)).resolves.toHaveLength(3);
    });

    it('それ以外のエラーは再試行したうえで投げる', async () => {
      vi.useFakeTimers();
      try {
        const { supabase } = await import('@shared/supabaseClient');
        (supabase.from as Mock)
          .mockReset()
          .mockImplementation(() =>
            queryMock({ data: null, error: { message: 'boom', code: '500' } })
          );

        const { loadRecentChatLogs } = await import('./chatQueries');
        const loading = loadRecentChatLogs(ROOM_ID, 10);
        const settled = expect(loading).rejects.toThrow('boom');
        await vi.advanceTimersByTimeAsync(1000 + 2000);
        await settled;
        expect(supabase.from).toHaveBeenCalledTimes(3);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('loadAllRoomsChatLogs', () => {
    it('全部屋まとめは email / ua を取得しない', async () => {
      const { supabase } = await import('@shared/supabaseClient');
      const query = {
        select: vi.fn(() => query),
        order: vi.fn(() => query),
        limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
      };
      (supabase.from as Mock).mockReset().mockReturnValue(query);

      const { loadAllRoomsChatLogs } = await import('./chatQueries');
      await loadAllRoomsChatLogs(200);

      const columns = (query.select.mock.calls[0] as unknown as [string])[0].split(',');
      expect(columns).not.toContain('email');
      expect(columns).not.toContain('ua');
      expect(query.limit).toHaveBeenCalledWith(200);
    });
  });
});
