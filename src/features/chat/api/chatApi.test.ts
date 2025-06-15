import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn());
  (import.meta as any).env = {
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon',
  };
});

describe('chatApi', () => {
  it('loadChatLogs fetches chats', async () => {
    const mockData = [
      { id: '1', name: 'A', color: '#000', message: 'hello', time: 1 },
    ];
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => mockData } as any);
    const { loadChatLogs } = await import('./chatApi');
    const res = await loadChatLogs();
    expect(res).toEqual(mockData);
  });

  it('postChat sends POST', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as any);
    const { postChat } = await import('./chatApi');
    const chat = { id: '1', name: 'A', color: '#000', message: 'hi', time: 1 };
    await postChat(chat);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/chat_logs'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('clearChatLogs sends DELETE', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({}) } as any);
    const { clearChatLogs } = await import('./chatApi');
    await clearChatLogs();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/chat_logs'),
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
