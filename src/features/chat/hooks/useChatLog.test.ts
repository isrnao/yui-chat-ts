import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChatLog } from './useChatLog';
import { loadChatLogs, postChat, clearChatLogs } from '@features/chat/api/chatApi';
import type { Chat } from '@features/chat/types';

vi.mock('@features/chat/api/chatApi', () => ({
  loadChatLogs: vi.fn(),
  postChat: vi.fn(),
  clearChatLogs: vi.fn(),
}));

const mockLoad = vi.mocked(loadChatLogs);
const mockPost = vi.mocked(postChat);
const mockClear = vi.mocked(clearChatLogs);

describe('useChatLog', () => {
  const chats: Chat[] = [
    { id: '1', name: 'A', color: '#000', message: 'hi', time: 1 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads chats on mount', async () => {
    mockLoad.mockResolvedValue(chats);
    const { result } = renderHook(() => useChatLog());
    await waitFor(() => expect(result.current.chatLog).toEqual(chats));
  });

  it('adds chat and posts', async () => {
    mockLoad.mockResolvedValue([]);
    const { result } = renderHook(() => useChatLog());
    await waitFor(() => expect(result.current.chatLog).toEqual([]));
    const chat: Chat = { id: '2', name: 'B', color: '#111', message: 'hello', time: 2 };
    await act(async () => {
      await result.current.addChat(chat);
    });
    expect(result.current.chatLog[0]).toEqual(chat);
    expect(mockPost).toHaveBeenCalledWith(chat);
  });

  it('clears chat log', async () => {
    mockLoad.mockResolvedValue(chats);
    const { result } = renderHook(() => useChatLog());
    await waitFor(() => expect(result.current.chatLog).toEqual(chats));
    await act(async () => {
      await result.current.clear();
    });
    expect(result.current.chatLog).toEqual([]);
    expect(mockClear).toHaveBeenCalled();
  });
});
