import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chat } from '@features/chat/types';

const { loadInitialChatLogs, loadChatLogsWithPaging, sampleChat } = vi.hoisted(() => {
  const sampleChat = {
    uuid: 'chat-1',
    room_id: 'superbeginner',
    name: 'user',
    color: '#000000',
    message: 'hello',
    time: 1,
    ip_masked: '',
    ua: '',
  } as Chat;

  return {
    loadInitialChatLogs: vi.fn(),
    loadChatLogsWithPaging: vi.fn(),
    sampleChat,
  };
});

vi.mock('@features/chat/api/chatApi', () => ({
  loadInitialChatLogs,
  loadChatLogsWithPaging,
}));

async function importSubject() {
  vi.resetModules();
  return await import('./usePreloadChatLogs');
}

describe('usePreloadChatLogs resource cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 失敗は空配列へ変換せず reject を伝播させる（ErrorBoundary で扱えるようにするため）。
  // 失敗した promise はキャッシュから外れるので次の呼び出しで再試行できる。
  it('removes failed preload entries so the next call can retry', async () => {
    loadInitialChatLogs
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce([sampleChat]);

    const { usePreloadChatLogs } = await importSubject();

    await expect(usePreloadChatLogs('superbeginner')).rejects.toThrow('temporary failure');
    await expect(usePreloadChatLogs('superbeginner')).resolves.toEqual([sampleChat]);

    expect(loadInitialChatLogs).toHaveBeenCalledTimes(2);
  });

  it('removes failed paging entries so the same page can retry', async () => {
    loadInitialChatLogs.mockResolvedValue([]);
    loadChatLogsWithPaging
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ data: [sampleChat], hasMore: false });

    const { fetchInitialChatLogPage } = await importSubject();

    await expect(fetchInitialChatLogPage('superbeginner', 50, 0)).rejects.toThrow(
      'temporary failure'
    );
    await expect(fetchInitialChatLogPage('superbeginner', 50, 0)).resolves.toEqual({
      data: [sampleChat],
      hasMore: false,
    });

    expect(loadInitialChatLogs).toHaveBeenCalledTimes(1);
    expect(loadChatLogsWithPaging).toHaveBeenCalledTimes(2);
  });

  // 回帰テスト: 以前は reloadToken が変わっても内部取得が useCache=true だったため、
  // 「再読込」を押しても最大 5 分間は同じ snapshot が返っていた
  it('明示的な再読込では TTL キャッシュを迂回して取り直す', async () => {
    loadInitialChatLogs.mockResolvedValue([]);
    loadChatLogsWithPaging.mockResolvedValue({ data: [sampleChat], hasMore: false });

    const { fetchInitialChatLogPage } = await importSubject();

    await fetchInitialChatLogPage('superbeginner', 50, 0);
    expect(loadChatLogsWithPaging).toHaveBeenLastCalledWith('superbeginner', 50, 0, true);

    await fetchInitialChatLogPage('superbeginner', 50, 1);
    expect(loadChatLogsWithPaging).toHaveBeenLastCalledWith('superbeginner', 50, 0, false);
  });

  it('明示的な再読込のあとは preload も取り直す', async () => {
    loadInitialChatLogs.mockResolvedValue([]);
    loadChatLogsWithPaging.mockResolvedValue({ data: [sampleChat], hasMore: false });

    const { fetchInitialChatLogPage, usePreloadChatLogs } = await importSubject();

    await fetchInitialChatLogPage('superbeginner', 50, 0);
    expect(loadInitialChatLogs).toHaveBeenCalledTimes(1);

    await fetchInitialChatLogPage('superbeginner', 50, 1);
    await usePreloadChatLogs('superbeginner');

    expect(loadInitialChatLogs).toHaveBeenCalledTimes(2);
  });
});
