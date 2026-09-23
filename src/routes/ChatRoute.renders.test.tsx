import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import ChatRoute from './ChatRoute';
import AllRoomsRoute from './AllRoomsRoute';

/**
 * 発言欄に入力したときの再レンダーの範囲（.kiro/specs/react-2026-refactoring Task 1.5 / 9.5）。
 * ルートの直下にある RetroSplitter の描画回数で、ルート全体が再レンダーされたかを判定する。
 */
const splitterRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock('@features/chat/components/RetroSplitter', () => ({
  default: ({ top, bottom }: { top: ReactNode; bottom: ReactNode }) => {
    splitterRenders.count += 1;
    return (
      <div>
        {top}
        {bottom}
      </div>
    );
  },
}));
vi.mock('@features/chat/api/chatQueries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/api/chatQueries')>()),
  loadRecentChatLogs: vi.fn(() => Promise.resolve([])),
  loadAllRoomsChatLogs: vi.fn(() => Promise.resolve([])),
}));
vi.mock('@features/chat/api/realtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/api/realtime')>()),
  subscribeChatLogs: vi.fn(() => ({ unsubscribe: vi.fn() })),
  subscribeAllRoomsChatLogs: vi.fn(() => ({ unsubscribe: vi.fn() })),
  onLookBroadcast: vi.fn(() => vi.fn()),
}));
vi.mock('@features/chat/api/saveChat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/api/saveChat')>()),
  saveChatLogOptimistic: vi.fn((_roomId: string, chat: object) =>
    Promise.resolve({ ...chat, uuid: 'server-uuid', optimistic: false })
  ),
}));

async function enter() {
  fireEvent.change(screen.getByRole('textbox', { name: 'おなまえ' }), {
    target: { value: 'ゆい' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'チャットに参加する' }));
  return screen.findByRole('textbox', { name: '発言' });
}

/** 発言欄に 1 文字ずつ入力し、その間のルートの再レンダー回数を返す */
function typeAndCountRouteRenders(input: HTMLElement, text: string): number {
  const before = splitterRenders.count;
  let value = '';
  for (const char of text) {
    value += char;
    fireEvent.change(input, { target: { value } });
  }
  return splitterRenders.count - before;
}

describe.each([
  ['ChatRoute', () => <ChatRoute roomId="superbeginner" />],
  ['AllRoomsRoute', () => <AllRoomsRoute />],
])('%s の発言入力', (_name, renderRoute) => {
  beforeEach(() => {
    splitterRenders.count = 0;
  });

  it('1 文字の入力でルート全体を再レンダーしない', async () => {
    render(renderRoute());
    const input = await enter();

    const renders = typeAndCountRouteRenders(input, 'こんにちは');
    expect(renders).toBe(0);
  });
});
