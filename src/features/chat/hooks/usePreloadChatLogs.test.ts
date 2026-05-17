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
    ip: '',
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

  it('removes failed preload entries so the next call can retry', async () => {
    loadInitialChatLogs
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce([sampleChat]);

    const { usePreloadChatLogs } = await importSubject();

    await expect(usePreloadChatLogs('superbeginner')).resolves.toEqual([]);
    await expect(usePreloadChatLogs('superbeginner')).resolves.toEqual([sampleChat]);

    expect(loadInitialChatLogs).toHaveBeenCalledTimes(2);
  });

  it('removes failed paging entries so the same page can retry', async () => {
    loadInitialChatLogs.mockResolvedValue([]);
    loadChatLogsWithPaging
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce({ data: [sampleChat], hasMore: false });

    const { fetchInitialChatLogPage } = await importSubject();

    await expect(fetchInitialChatLogPage('superbeginner', 50, 0)).resolves.toEqual({
      data: [],
      hasMore: false,
    });
    await expect(fetchInitialChatLogPage('superbeginner', 50, 0)).resolves.toEqual({
      data: [sampleChat],
      hasMore: false,
    });

    expect(loadInitialChatLogs).toHaveBeenCalledTimes(1);
    expect(loadChatLogsWithPaging).toHaveBeenCalledTimes(2);
  });
});
