import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Supabaseクライアントの基本的なモック
// 複雑なモックが必要なテストは削除済みなので、最低限の設定のみ
vi.mock('@shared/supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [] }),
        }),
      }),
      insert: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockReturnValue({
        neq: vi.fn().mockResolvedValue({}),
      }),
    }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    }),
  },
}));
