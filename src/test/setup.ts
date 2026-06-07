import '@testing-library/jest-dom';
import { vi } from 'vitest';

// jsdom 環境で未実装の ResizeObserver をモック
type ResizeObserverCallbackType = (...args: unknown[]) => void;

class ResizeObserverMock {
  constructor(_callback: ResizeObserverCallbackType) {}
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  value: ResizeObserverMock,
  writable: true,
  configurable: true,
});

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
      send: vi.fn().mockResolvedValue('ok'),
    }),
    functions: {
      // save-chat Edge Function の既定モック。サーバー生成値を返す。
      invoke: vi.fn().mockResolvedValue({
        data: { uuid: 'server-uuid', room_id: 'superbeginner', time: 1 },
        error: null,
      }),
    },
  },
}));
