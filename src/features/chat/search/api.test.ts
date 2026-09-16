import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@shared/supabaseClient';
import { searchChats } from './api';
const input = {
  mode: 'search' as const,
  roomId: 'superbeginner' as const,
  q: '京都',
  rangeDays: 30 as const,
};
const invoke = vi.mocked(supabase.functions.invoke);
beforeEach(() => vi.clearAllMocks());
describe('検索API契約', () => {
  it('余分な属性を画面へ渡さない', async () => {
    invoke.mockResolvedValue({
      data: {
        items: [
          {
            uuid: 'a',
            roomId: input.roomId,
            name: '匿名',
            time: 10,
            excerpt: '京都',
            ip: 'secret',
          },
        ],
        nextCursor: null,
      },
      error: null,
    });
    const result = await searchChats(input, new AbortController().signal);
    expect(result.items[0]).not.toHaveProperty('ip');
  });
  it('他の部屋の応答を拒否する', async () => {
    invoke.mockResolvedValue({
      data: {
        items: [{ uuid: 'a', roomId: 'all', name: '匿名', time: 10, excerpt: '京都' }],
        nextCursor: null,
      },
      error: null,
    });
    await expect(searchChats(input, new AbortController().signal)).rejects.toThrow(
      '取得できません'
    );
  });
  it('HTTPエラーの本文を画面へそのまま出さない', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { context: new Response('raw SQL', { status: 429 }) },
    });
    await expect(searchChats(input, new AbortController().signal)).rejects.toThrow('少し待って');
  });
});
