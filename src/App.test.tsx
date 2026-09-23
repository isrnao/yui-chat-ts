import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { preloadRoute } from './routes/routeLoaders';
import { loadRecentChatLogs } from '@features/chat/api/chatQueries';
import { fetchRoomParticipantCounts } from '@features/top/api/roomCountsApi';

// 複雑なSupabase統合部分はモック化
vi.mock('@features/chat/api/chatQueries', () => ({
  loadRecentChatLogs: vi.fn().mockResolvedValue([]),
  loadAllRoomsChatLogs: vi.fn().mockResolvedValue([]),
  loadChatRanking: vi.fn().mockResolvedValue([]),
  clearChatLogsByName: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@features/chat/api/saveChat', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/chat/api/saveChat')>()),
  saveChatLogOptimistic: vi.fn().mockResolvedValue({ uuid: 'test', time: Date.now() }),
}));
vi.mock('@features/chat/api/realtime', () => ({
  subscribeChatLogs: vi.fn(() => ({ unsubscribe: vi.fn() })),
  subscribeAllRoomsChatLogs: vi.fn(() => ({ unsubscribe: vi.fn() })),
  broadcastLookEvent: vi.fn(),
  broadcastUnlookEvent: vi.fn(),
  onLookBroadcast: vi.fn(() => vi.fn()),
}));

vi.mock('@features/chat/utils/webAudioPlayer', () => ({
  playNotificationSound: vi.fn(),
  stopNotificationSound: vi.fn(),
  isAudioUnlocked: vi.fn().mockReturnValue(false),
  unlockAudio: vi.fn(),
}));

vi.mock('@features/top/api/roomCountsApi', () => ({
  fetchRoomParticipantCounts: vi.fn().mockResolvedValue({}),
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
  document.documentElement.style.backgroundColor = '';
  document.body.style.backgroundColor = '';
  document
    .querySelectorAll('meta[name="theme-color"], meta[name="msapplication-TileColor"]')
    .forEach((element) => element.remove());
});

/**
 * ルートチャンクを解決してから描画する。本番の main.tsx と同じ順序。
 *
 * main.tsx が待つのは、部屋ページの HTML に既に表示可能な内容が入っており、
 * 先に描画するとそれを消して空白にしてしまうため。待っている間はユーザーに
 * 完成した画面が見えている。
 * 失敗時の挙動 (ErrorBoundary) は RouteHost.test.tsx で検証している。
 */
async function renderApp() {
  // チャット系ルートは lazy なので、本番の main.tsx と同じくチャンクの解決を待ってから描画する
  // (待たずに描画するとプリレンダ済みの本文が消えて空白になる)。
  // トップは静的 import なので preloadRoute が null を返し、待たずに描画される。
  await preloadRoute(window.location.pathname);
  render(<App />);
}

describe('<App />', () => {
  // トップは入口なので lazy にしない。同期レンダーで本文が出ること自体が要件
  // (lazy に戻すと findBy が必要になり、実画面では読み込み待ちが挟まる)
  it('shows the top page immediately without route loading fallback', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'お気楽チャット' })).toBeInTheDocument();
    expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
    expect(document.body.style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(document.documentElement.style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#ffffff'
    );

    await waitFor(() => {
      expect(fetchRoomParticipantCounts).toHaveBeenCalled();
    });
  });

  it('shows the current room title in the entry form immediately', async () => {
    window.history.replaceState(null, '', '/chat/superbeginner');

    await renderApp();

    const visibleTitle = (await screen.findAllByText('超初心者チャット')).find(
      (el) => !el.closest('.sr-only')
    );
    expect(visibleTitle).toBeDefined();
    expect(visibleTitle?.tagName).toBe('HEADER');
    expect(document.body.style.backgroundColor).toBe('rgb(193, 252, 146)');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#c1fc92'
    );

    await waitFor(() => {
      expect(loadRecentChatLogs).toHaveBeenCalledWith('superbeginner', 10);
    });
  });

  it('shows the chanari entry form immediately without route loading fallback', async () => {
    window.history.replaceState(null, '', '/chanari/durarara');

    await renderApp();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'デュラララ チャット' })
    ).toBeInTheDocument();
    expect(screen.queryByText('読み込み中…')).not.toBeInTheDocument();
    expect(document.body.style.backgroundColor).toBe('rgb(255, 255, 221)');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#ffffdd'
    );

    await waitFor(() => {
      expect(loadRecentChatLogs).toHaveBeenCalledWith('durarara', 10);
    });
    await waitFor(() => {
      expect(screen.queryByText('チャットログを読み込み中...')).not.toBeInTheDocument();
    });
  });

  it('shows the not found page immediately without route loading fallback', async () => {
    window.history.replaceState(null, '', '/not-found');

    await renderApp();

    expect(
      await screen.findByRole('heading', { level: 1, name: '４０４ＥＲＲＯＲ' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
    expect(document.body.style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#ffffff'
    );
  });

  it('redirects /chat to the default chat room and updates history', async () => {
    window.history.replaceState(null, '', '/chat');

    await renderApp();

    // 初回 render 時点で確定 route (chat-room / 超初心者チャット) が描画される
    const visibleTitle = (await screen.findAllByText('超初心者チャット')).find(
      (el) => !el.closest('.sr-only')
    );
    expect(visibleTitle).toBeDefined();
    expect(visibleTitle?.tagName).toBe('HEADER');

    // chat 用 chrome 色が適用される
    expect(document.body.style.backgroundColor).toBe('rgb(193, 252, 146)');

    // commit 後 effect で URL が /chat/superbeginner/ に書き換わる
    await waitFor(() => {
      expect(window.location.pathname).toBe('/chat/superbeginner/');
    });

    // 確定 roomId でログを取得する
    await waitFor(() => {
      expect(loadRecentChatLogs).toHaveBeenCalledWith('superbeginner', 10);
    });
  });

  it('redirects /chanari to the default chanari room and updates history', async () => {
    window.history.replaceState(null, '', '/chanari');

    await renderApp();

    // 初回 render 時点で確定 route (chanari-room) が描画される (default room ID は chat と共通)
    expect(
      await screen.findByRole('heading', { level: 1, name: '超初心者チャット' })
    ).toBeInTheDocument();

    // chanari 用 chrome 色が適用される
    expect(document.body.style.backgroundColor).toBe('rgb(255, 255, 221)');

    // commit 後 effect で URL が /chanari/superbeginner/ に書き換わる
    await waitFor(() => {
      expect(window.location.pathname).toBe('/chanari/superbeginner/');
    });
  });
});
