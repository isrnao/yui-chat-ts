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
});
