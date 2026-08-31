import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Chat } from '@features/chat/types';

type PostgresPayload = { new: Record<string, unknown> };

describe('chatAllApi', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('realtime INSERT から email / ua を落として初期ロードと形を揃える', async () => {
    const { supabase } = await import('@shared/supabaseClient');

    let handler: ((payload: PostgresPayload) => void) | undefined;
    const channel = {
      on: vi.fn((_event: string, _filter: unknown, cb: (payload: PostgresPayload) => void) => {
        handler = cb;
        return channel;
      }),
      subscribe: vi.fn(() => channel),
    };
    (supabase.channel as Mock).mockReturnValue(channel);

    const { subscribeAllRoomsChatLogs } = await import('./chatAllApi');
    const received: Chat[] = [];
    subscribeAllRoomsChatLogs((chat) => received.push(chat));

    handler?.({
      new: {
        uuid: 'chat-1',
        room_id: 'superbeginner',
        name: 'user-1',
        color: '#000000',
        message: 'hello',
        time: 1,
        email: 'user@example.com',
        ip_masked: '203.0.113.*',
        ua: 'Mozilla/5.0 (Nintendo 3DS; U; ; ja)',
      },
    });

    expect(received).toHaveLength(1);
    // 全部屋ビューの SELECT_COLUMNS は email / ua を含まないため realtime 側でも落とす
    expect(received[0].email).toBeUndefined();
    expect(received[0].ua).toBe('');
    // ip_masked は初期ロードでも取得しているので保持する
    expect(received[0].ip_masked).toBe('203.0.113.*');
  });
});
