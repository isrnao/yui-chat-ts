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
  // 失敗した thenable は同じ key では保持する。use() は同じ key に安定した thenable を
  // 要求するため、失敗時に消すと React の retry render で余分な取得が走ってしまう。
  it('同じ key では失敗した thenable を保持し、再取得を走らせない', async () => {
    loadInitialChatLogs.mockRejectedValue(new Error('temporary failure'));

    const { fetchInitialChatLogPage } = await importSubject();

    const first = fetchInitialChatLogPage('superbeginner', 50, 0);
    const second = fetchInitialChatLogPage('superbeginner', 50, 0);

    expect(second).toBe(first);
    await expect(first).rejects.toThrow('temporary failure');
    await expect(second).rejects.toThrow('temporary failure');
    expect(loadInitialChatLogs).toHaveBeenCalledTimes(1);
  });

  it('paging の失敗も同じ key では保持する', async () => {
    loadInitialChatLogs.mockResolvedValue([]);
    loadChatLogsWithPaging.mockRejectedValue(new Error('temporary failure'));

    const { fetchInitialChatLogPage } = await importSubject();

    await expect(fetchInitialChatLogPage('superbeginner', 50, 0)).rejects.toThrow(
      'temporary failure'
    );
    await expect(fetchInitialChatLogPage('superbeginner', 50, 0)).rejects.toThrow(
      'temporary failure'
    );

    expect(loadChatLogsWithPaging).toHaveBeenCalledTimes(1);
  });

  // 失敗した thenable の破棄は明示的な再読込 (reloadToken の変化) が担う
  it('reloadToken が変わると失敗した取得を捨てて再試行する', async () => {
    loadInitialChatLogs.mockRejectedValueOnce(new Error('temporary failure'));
    loadChatLogsWithPaging.mockResolvedValue({ data: [sampleChat], hasMore: false });

    const { fetchInitialChatLogPage } = await importSubject();

    await expect(fetchInitialChatLogPage('superbeginner', 50, 0)).rejects.toThrow(
      'temporary failure'
    );

    await expect(fetchInitialChatLogPage('superbeginner', 50, 1)).resolves.toEqual({
      data: [sampleChat],
      hasMore: false,
    });
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
