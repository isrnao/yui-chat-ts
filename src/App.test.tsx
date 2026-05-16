import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

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

vi.mock('@shared/utils/clientInfo', () => ({
  getClientIP: vi.fn().mockResolvedValue('127.0.0.1'),
  getUserAgent: vi.fn().mockReturnValue('test-agent'),
  prefetchClientIP: vi.fn(),
  resetClientIPCache: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/yui-chat-ts/');
});

describe('<App />', () => {
  it('should render the app without crashing', () => {
    render(<App />);
    // アプリが正常にレンダリングされることを確認
    expect(document.body).toBeInTheDocument();
  });

  it('shows the current room title in the entry form', async () => {
    window.history.replaceState(null, '', '/yui-chat-ts/chat/superbeginner');

    render(<App />);

    // ルートが lazy なので解決を待つ
    await screen.findAllByText('超初心者チャット');

    const visibleTitle = screen
      .getAllByText('超初心者チャット')
      .find((el) => !el.closest('.sr-only'));
    expect(visibleTitle).toBeDefined();
    expect(visibleTitle?.tagName).toBe('HEADER');
  });
});
