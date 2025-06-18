import { describe, it, expect, vi } from 'vitest';
import { loadChatLogs, saveChatLog, clearChatLogs } from './chatApi';
import { supabase } from './supabaseClient';
import type { Chat } from '@features/chat/types';

vi.mock('./supabaseClient', () => {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [] }),
    insert: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockReturnThis(),
    neq: vi.fn().mockResolvedValue({}),
  };
  return { supabase: { from: vi.fn(() => mockQuery), channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) })) } };
});

describe('chatApi with supabase', () => {
  it('loadChatLogs should query supabase', async () => {
    await loadChatLogs();
    expect(supabase.from).toHaveBeenCalledWith('chats');
  });

  it('saveChatLog should insert into supabase', async () => {
    const chat: Chat = { id: '1', name: 'A', color: '#000', message: 'hi', time: 1 };
    await saveChatLog(chat);
    const mock = supabase.from('chats');
    expect(mock.insert).toHaveBeenCalled();
  });

  it('clearChatLogs should delete from supabase', async () => {
    await clearChatLogs();
    const mock = supabase.from('chats');
    expect(mock.delete).toHaveBeenCalled();
  });
});
