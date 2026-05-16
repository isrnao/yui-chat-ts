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

  it('keeps offset-zero paging hasMore conservative when snapshot reaches the requested limit', async () => {
    const { supabase } = await import('@shared/supabaseClient');
    const from = supabase.from as Mock;
    from.mockReset();
    from.mockReturnValue(
      createQueryMock(Array.from({ length: 100 }, (_, index) => makeChat(index)))
    );

    const chatApi = await import('./chatApi');
    const result = await chatApi.loadChatLogsWithPaging(ROOM_ID, 100, 0, true);

    expect(result.data).toHaveLength(100);
    expect(result.hasMore).toBe(true);
  });
});
