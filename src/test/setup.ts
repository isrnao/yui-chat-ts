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

// jsdom 26 の <dialog> は open 属性と表示（閉じていれば display: none）だけを持ち、showModal / close と
// Esc による cancel がない。ブラウザと同じ順序（cancel → 既定の動作なら close → close イベント）で補う
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.show = HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const top = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1);
    if (top && top.dispatchEvent(new Event('cancel', { cancelable: true }))) top.close();
  });
}

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
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
      send: vi.fn().mockResolvedValue('ok'),
    }),
    // チャンネルの後片付け（購読解除時に呼ばれる）
    removeChannel: vi.fn(),
    functions: {
      // save-chat Edge Function の既定モック。サーバー生成値を返す。
      invoke: vi.fn().mockResolvedValue({
        data: { uuid: 'server-uuid', room_id: 'superbeginner', time: 1 },
        error: null,
      }),
    },
  },
}));
