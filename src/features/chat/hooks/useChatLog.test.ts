import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatLog } from './useChatLog';
import { loadChatLogs, saveChatLogs, clearChatLogs } from '@features/chat/api/chatApi';
import type { Chat } from '@features/chat/types';

// モック化
vi.mock('@features/chat/api/chatApi', () => ({
  loadChatLogs: vi.fn(),
  saveChatLogs: vi.fn(),
  clearChatLogs: vi.fn(),
}));

describe('useChatLog', () => {
  const mockLoadChatLogs = vi.mocked(loadChatLogs);
  const mockSaveChatLogs = vi.mocked(saveChatLogs);
  const mockClearChatLogs = vi.mocked(clearChatLogs);

  const mockChats: Chat[] = [
    { id: '1', name: 'User1', color: '#ff0000', message: 'Hello', time: 100 },
    { id: '2', name: 'User2', color: '#00ff00', message: 'World', time: 200 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadChatLogs.mockReturnValue([]);
  });

  it('should initialize with loaded chat logs', () => {
    mockLoadChatLogs.mockReturnValue(mockChats);

    const { result } = renderHook(() => useChatLog());

    expect(result.current.chatLog).toEqual(mockChats);
    expect(mockLoadChatLogs).toHaveBeenCalledOnce();
  });

  it('should initialize with empty array when no saved logs', () => {
    mockLoadChatLogs.mockReturnValue([]);

    const { result } = renderHook(() => useChatLog());

    expect(result.current.chatLog).toEqual([]);
    expect(mockLoadChatLogs).toHaveBeenCalledOnce();
  });

  it('should add new chat to the beginning of the log', () => {
    mockLoadChatLogs.mockReturnValue(mockChats);

    const { result } = renderHook(() => useChatLog());

    const newChat: Chat = {
      id: '3',
      name: 'User3',
      color: '#0000ff',
      message: 'New message',
      time: 300,
    };

    act(() => {
      result.current.addChat(newChat);
    });

    expect(result.current.chatLog).toHaveLength(3);
    expect(result.current.chatLog[0]).toEqual(newChat);
    expect(result.current.chatLog[1]).toEqual(mockChats[0]);
    expect(result.current.chatLog[2]).toEqual(mockChats[1]);
    expect(mockSaveChatLogs).toHaveBeenCalledWith([newChat, ...mockChats]);
  });

  it('should limit chat log to 2000 items when adding', () => {
    const largeChatLog: Chat[] = Array.from({ length: 2000 }, (_, i) => ({
      id: String(i),
      name: `User${i}`,
      color: '#000000',
      message: `Message ${i}`,
      time: i,
    }));

    mockLoadChatLogs.mockReturnValue(largeChatLog);

    const { result } = renderHook(() => useChatLog());

    const newChat: Chat = {
      id: '2000',
      name: 'NewUser',
      color: '#ffffff',
      message: 'New message',
      time: 2000,
    };

    act(() => {
      result.current.addChat(newChat);
    });

    expect(result.current.chatLog).toHaveLength(2000);
    expect(result.current.chatLog[0]).toEqual(newChat);
    // 最後のアイテムは削除されているはず
    expect(result.current.chatLog.some((chat) => chat.id === '1999')).toBe(false);
    expect(mockSaveChatLogs).toHaveBeenCalledWith(result.current.chatLog);
  });

  it('should clear chat log', () => {
    mockLoadChatLogs.mockReturnValue(mockChats);

    const { result } = renderHook(() => useChatLog());

    expect(result.current.chatLog).toHaveLength(2);

    act(() => {
      result.current.clear();
    });

    expect(result.current.chatLog).toEqual([]);
    expect(mockClearChatLogs).toHaveBeenCalledOnce();
  });

  it('should allow manual setting of chat log', () => {
    const { result } = renderHook(() => useChatLog());

    const newChatLog: Chat[] = [
      { id: '10', name: 'NewUser', color: '#ff00ff', message: 'Manual set', time: 1000 },
    ];

    act(() => {
      result.current.setChatLog(newChatLog);
    });

    expect(result.current.chatLog).toEqual(newChatLog);
    // setChatLogは直接保存しないことを確認
    expect(mockSaveChatLogs).not.toHaveBeenCalled();
  });

  it('should save chat logs when addChat is called multiple times', () => {
    const { result } = renderHook(() => useChatLog());

    const chat1: Chat = { id: '1', name: 'User1', color: '#ff0000', message: 'First', time: 100 };
    const chat2: Chat = { id: '2', name: 'User2', color: '#00ff00', message: 'Second', time: 200 };

    act(() => {
      result.current.addChat(chat1);
    });

    act(() => {
      result.current.addChat(chat2);
    });

    expect(result.current.chatLog).toEqual([chat2, chat1]);
    expect(mockSaveChatLogs).toHaveBeenCalledTimes(2);
    expect(mockSaveChatLogs).toHaveBeenNthCalledWith(1, [chat1]);
    expect(mockSaveChatLogs).toHaveBeenNthCalledWith(2, [chat2, chat1]);
  });

  it('should handle concurrent addChat calls correctly', () => {
    const { result } = renderHook(() => useChatLog());

    const chat1: Chat = { id: '1', name: 'User1', color: '#ff0000', message: 'First', time: 100 };
    const chat2: Chat = { id: '2', name: 'User2', color: '#00ff00', message: 'Second', time: 200 };
    const chat3: Chat = { id: '3', name: 'User3', color: '#0000ff', message: 'Third', time: 300 };

    // 複数のチャットを連続で追加
    act(() => {
      result.current.addChat(chat1);
      result.current.addChat(chat2);
      result.current.addChat(chat3);
    });

    expect(result.current.chatLog).toEqual([chat3, chat2, chat1]);
    expect(mockSaveChatLogs).toHaveBeenCalledTimes(3);
  });

  it('should maintain proper order when adding chats to existing log', () => {
    const existingChats: Chat[] = [
      { id: 'existing1', name: 'ExistingUser', color: '#000000', message: 'Existing', time: 50 },
    ];
    mockLoadChatLogs.mockReturnValue(existingChats);

    const { result } = renderHook(() => useChatLog());

    const newChat: Chat = {
      id: 'new1',
      name: 'NewUser',
      color: '#ffffff',
      message: 'New',
      time: 100,
    };

    act(() => {
      result.current.addChat(newChat);
    });

    expect(result.current.chatLog).toEqual([newChat, ...existingChats]);
  });

  it('should not call save when setChatLog is used directly', () => {
    const { result } = renderHook(() => useChatLog());

    const manualChats: Chat[] = [
      { id: 'manual1', name: 'ManualUser', color: '#ff00ff', message: 'Manual', time: 1000 },
    ];

    act(() => {
      result.current.setChatLog(manualChats);
    });

    expect(result.current.chatLog).toEqual(manualChats);
    // setChatLogは保存しない
    expect(mockSaveChatLogs).not.toHaveBeenCalled();
    expect(mockClearChatLogs).not.toHaveBeenCalled();
  });
});
