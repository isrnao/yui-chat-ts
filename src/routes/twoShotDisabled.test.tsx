import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';
import { preloadRoute } from './routeLoaders';
import { resolveRouteFollowingRedirects } from './resolveRoute';
import { getRoomMeta, TWO_SHOT_CHAT_ENABLED } from '@features/chat/rooms';
import { loadRecentChatLogs } from '@features/chat/api/chatQueries';
import { fetchLobby } from '@features/two-shot-chat/api/twoShotApi';
import { buildRoomCountsUrl } from '@features/top/api/roomCountsApi';

/**
 * ツーショットチャットを一時的に止めている間（hotfix、rooms.ts の TWO_SHOT_CHAT_ENABLED が false）は、
 * `/chat/2shot/` で通常のチャットルームを出す（チャット・メッセージ機能に対する電気通信事業法の規制への対応）。
 * 再開して TWO_SHOT_CHAT_ENABLED を true に戻したら、このファイルは消す
 */
vi.mock('@features/chat/api/chatQueries', () => ({
  loadRecentChatLogs: vi.fn().mockResolvedValue([]),
  loadAllRoomsChatLogs: vi.fn().mockResolvedValue([]),
  loadChatRanking: vi.fn().mockResolvedValue([]),
  clearMyChats: vi.fn().mockResolvedValue([]),
}));
vi.mock('@features/chat/api/realtime', () => ({
  subscribeChatLogs: vi.fn(() => ({ unsubscribe: vi.fn() })),
  subscribeAllRoomsChatLogs: vi.fn(() => ({ unsubscribe: vi.fn() })),
}));
vi.mock('@features/chat/utils/webAudioPlayer', () => ({
  playNotificationSound: vi.fn(),
  stopNotificationSound: vi.fn(),
  isAudioUnlocked: vi.fn().mockReturnValue(false),
  unlockAudio: vi.fn(),
}));
vi.mock('@features/two-shot-chat/api/twoShotApi', () => ({
  callTwoShot: vi.fn().mockResolvedValue('failed'),
  fetchLobby: vi.fn().mockResolvedValue({}),
  REQUEST_TIMEOUT_MS: 10_000,
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('ツーショットチャットを止めている間（hotfix）', () => {
  it('TWO_SHOT_CHAT_ENABLED は false', () => {
    expect(TWO_SHOT_CHAT_ENABLED).toBe(false);
  });

  it('/chat/2shot/ は通常の部屋、/chanari/2shot/ はちゃなりの部屋になる', () => {
    expect(resolveRouteFollowingRedirects('/chat/2shot/')).toEqual({
      route: { type: 'chat-room', roomId: '2shot' },
      finalPathname: '/chat/2shot/',
    });
    expect(resolveRouteFollowingRedirects('/chanari/2shot/').route).toEqual({
      type: 'chanari-room',
      roomId: '2shot',
    });
  });

  it('部屋の紹介文は、発言が公開されることを書く（2 人にだけ見えるとは書かない）', () => {
    const { description } = getRoomMeta('2shot');
    expect(description).toContain('誰でも読めます');
    expect(description).not.toContain('2人にだけ見え');
  });

  it('トップの人数は、2shot もほかの部屋と同じく公開ログから数える', () => {
    const url = new URL(buildRoomCountsUrl('https://example.supabase.co', 0));
    expect(url.searchParams.get('room_id')).toMatch(/[(,]2shot[,)]/);
  });

  it('/chat/2shot/ を開くと通常のチャットの入室画面を出し、ツーショットチャットの API は呼ばない', async () => {
    window.history.replaceState(null, '', '/chat/2shot/');
    await preloadRoute(window.location.pathname);
    render(<App />);

    expect(await screen.findByRole('button', { name: 'チャットに参加する' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 2, name: 'ツーショットチャット' })
    ).not.toBeInTheDocument();
    await waitFor(() => expect(loadRecentChatLogs).toHaveBeenCalled());
    expect(fetchLobby).not.toHaveBeenCalled();
  });
});
