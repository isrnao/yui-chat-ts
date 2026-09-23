import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ChatRoute from './ChatRoute';

/**
 * ランキングを開いている間もログ一覧は Activity で残し、戻ったときに再マウントしない
 * （.kiro/specs/react-2026-refactoring Requirement 12.2 / Task 12.5）。
 */
const mounts = vi.hoisted(() => ({ count: 0 }));

vi.mock('@features/chat/components/ChatLogList', () => ({
  // Activity は非表示の間 Effect を止め、表示に戻すと Effect をもう一度走らせる（再マウントではない）。
  // そのため Effect ではなく、インスタンスが作られたとき（useState の初期化）を数える
  default: function ChatLogListMock() {
    useState(() => {
      mounts.count += 1;
      return mounts.count;
    });
    return <div data-testid="chat-log-list-mock">ログ</div>;
  },
}));
vi.mock('@features/chat/api/chatQueries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/api/chatQueries')>()),
  loadRecentChatLogs: vi.fn(() => Promise.resolve([])),
  loadChatRanking: vi.fn(() => Promise.resolve([])),
}));
vi.mock('@features/chat/api/realtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/api/realtime')>()),
  subscribeChatLogs: vi.fn(() => ({ unsubscribe: vi.fn() })),
  onLookBroadcast: vi.fn(() => vi.fn()),
}));
vi.mock('@features/chat/api/saveChat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/api/saveChat')>()),
  saveChatLogOptimistic: vi.fn((_roomId: string, chat: object) =>
    Promise.resolve({ ...chat, uuid: 'server-uuid', optimistic: false })
  ),
}));

describe('ChatRoute のランキングとログの切り替え', () => {
  beforeEach(() => {
    mounts.count = 0;
  });

  it('ランキングから戻ってもログ一覧を再マウントせず、スクロール位置も保つ', async () => {
    render(<ChatRoute roomId="superbeginner" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'おなまえ' }), {
      target: { value: 'ゆい' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'チャットに参加する' }));
    await screen.findByText('[ランキング]');
    await screen.findByTestId('chat-log-list-mock');
    await waitFor(() => expect(mounts.count).toBe(1));

    const pane = screen.getByTestId('chat-log-pane');
    pane.scrollTop = 123;

    fireEvent.click(screen.getByText('[ランキング]'));
    expect(await screen.findByText(/の発言ランキング$/)).toBeInTheDocument();

    // 更新ボタン（onBackToChat）でログに戻る
    fireEvent.click(screen.getByRole('button', { name: '更新' }));
    await waitFor(() => {
      expect(screen.queryByText(/の発言ランキング$/)).not.toBeInTheDocument();
    });

    expect(mounts.count).toBe(1);
    expect(screen.getByTestId('chat-log-pane')).toBe(pane);
    expect(pane.scrollTop).toBe(123);
  });

  it('View Transition はランキングの開閉でだけ始め、ページを開いた直後には始めない', async () => {
    // ページ間の遷移のアニメーション中に、ログ一覧の Suspense が解けて View Transition が始まると、
    // ブラウザが片方を省いて未処理の AbortError（Transition was skipped）になっていた
    const started: string[][] = [];
    const done = () => Promise.resolve();
    const startViewTransition = vi.fn(
      (options: { update: () => void | Promise<void>; types?: string[] }) => {
        started.push([...(options.types ?? [])]);
        const finished = Promise.resolve().then(() => options.update());
        return {
          ready: finished,
          finished,
          updateCallbackDone: finished,
          skipTransition: vi.fn(),
          types: new Set(options.types),
        };
      }
    );
    Object.defineProperty(document, 'startViewTransition', {
      value: startViewTransition,
      configurable: true,
    });
    // React が View Transition の中で読むもの（jsdom には無い）
    Object.defineProperty(document, 'fonts', {
      value: { status: 'loaded', ready: Promise.resolve() },
      configurable: true,
    });
    Object.defineProperty(document.documentElement, 'getAnimations', {
      value: () => [],
      configurable: true,
    });
    Object.defineProperty(document.documentElement, 'animate', {
      value: () => ({ cancel: vi.fn(), finished: Promise.resolve() }),
      configurable: true,
    });
    try {
      render(<ChatRoute roomId="superbeginner" />);
      fireEvent.change(screen.getByRole('textbox', { name: 'おなまえ' }), {
        target: { value: 'ゆい' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'チャットに参加する' }));
      await screen.findByTestId('chat-log-list-mock');
      await done();
      expect(started).toEqual([]);

      fireEvent.click(screen.getByText('[ランキング]'));
      await waitFor(() => expect(started).toContainEqual(['ranking']));
      expect(started.every((types) => types.includes('ranking'))).toBe(true);
    } finally {
      Reflect.deleteProperty(document, 'startViewTransition');
      Reflect.deleteProperty(document, 'fonts');
      Reflect.deleteProperty(document.documentElement, 'getAnimations');
      Reflect.deleteProperty(document.documentElement, 'animate');
    }
  });
});
