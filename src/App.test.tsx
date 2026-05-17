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
});

describe('<App />', () => {
  it('shows the top page immediately without route loading fallback', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: 'お気楽チャット' })).toBeInTheDocument();
    expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument();

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
  });
});
