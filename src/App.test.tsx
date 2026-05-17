import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { loadChatLogs } from '@features/chat/api/chatApi';
import { fetchRoomParticipantCounts } from '@features/top/api/roomCountsApi';

// 複雑なSupabase統合部分はモック化
vi.mock('@features/chat/api/chatApi', () => ({
  loadChatLogs: vi.fn().mockResolvedValue([]),
  loadInitialChatLogs: vi.fn().mockResolvedValue([]),
  getCacheInfo: vi.fn().mockReturnValue({ cached: false }),
  saveChatLog: vi.fn(),
  saveChatLogOptimistic: vi.fn().mockResolvedValue({ uuid: 'test', time: Date.now() }),
  clearChatLogs: vi.fn(),
  clearChatLogsByName: vi.fn().mockResolvedValue(undefined),
  subscribeChatLogs: vi.fn(() => ({ unsubscribe: vi.fn() })),
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

vi.mock('@shared/utils/clientInfo', () => ({
  getClientIP: vi.fn().mockResolvedValue('127.0.0.1'),
  getUserAgent: vi.fn().mockReturnValue('test-agent'),
  prefetchClientIP: vi.fn(),
  resetClientIPCache: vi.fn(),
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

describe('<App />', () => {
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

    render(<App />);

    const visibleTitle = screen
      .getAllByText('超初心者チャット')
      .find((el) => !el.closest('.sr-only'));
    expect(visibleTitle).toBeDefined();
    expect(visibleTitle?.tagName).toBe('HEADER');
    expect(document.body.style.backgroundColor).toBe('rgb(193, 252, 146)');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#c1fc92'
    );

    await waitFor(() => {
      expect(loadChatLogs).toHaveBeenCalledWith('superbeginner');
    });
  });

  it('shows the chanari entry form immediately without route loading fallback', async () => {
    window.history.replaceState(null, '', '/chanari/durarara');

    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'デュラララ チャット' })
    ).toBeInTheDocument();
    expect(screen.queryByText('読み込み中…')).not.toBeInTheDocument();
    expect(document.body.style.backgroundColor).toBe('rgb(255, 255, 221)');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#ffffdd'
    );

    await waitFor(() => {
      expect(loadChatLogs).toHaveBeenCalledWith('durarara');
    });
    await waitFor(() => {
      expect(screen.queryByText('チャットログを読み込み中...')).not.toBeInTheDocument();
    });
  });

  it('shows the not found page immediately without route loading fallback', () => {
    window.history.replaceState(null, '', '/not-found');

    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: '４０４ＥＲＲＯＲ' })).toBeInTheDocument();
    expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();
    expect(document.body.style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#ffffff'
    );
  });

  it('redirects /chat to the default chat room and updates history', async () => {
    window.history.replaceState(null, '', '/chat');

    render(<App />);

    // 初回 render 時点で確定 route (chat-room / 超初心者チャット) が描画される
    const visibleTitle = screen
      .getAllByText('超初心者チャット')
      .find((el) => !el.closest('.sr-only'));
    expect(visibleTitle).toBeDefined();
    expect(visibleTitle?.tagName).toBe('HEADER');

    // chat 用 chrome 色が適用される
    expect(document.body.style.backgroundColor).toBe('rgb(193, 252, 146)');

    // commit 後 effect で URL が /chat/superbeginner に書き換わる
    await waitFor(() => {
      expect(window.location.pathname).toBe('/chat/superbeginner');
    });

    // 確定 roomId で chatApi が呼ばれる
    await waitFor(() => {
      expect(loadChatLogs).toHaveBeenCalledWith('superbeginner');
    });
  });

  it('redirects /chanari to the default chanari room and updates history', async () => {
    window.history.replaceState(null, '', '/chanari');

    render(<App />);

    // 初回 render 時点で確定 route (chanari-room) が描画される (default room ID は chat と共通)
    expect(screen.getByRole('heading', { level: 1, name: '超初心者チャット' })).toBeInTheDocument();

    // chanari 用 chrome 色が適用される
    expect(document.body.style.backgroundColor).toBe('rgb(255, 255, 221)');

    // commit 後 effect で URL が /chanari/superbeginner に書き換わる
    await waitFor(() => {
      expect(window.location.pathname).toBe('/chanari/superbeginner');
    });
  });
});
