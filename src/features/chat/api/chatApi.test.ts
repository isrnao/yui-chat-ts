// chatApi.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadChatLogs, saveChatLogs, clearChatLogs } from './chatApi';
import type { Chat } from '@features/chat/types';

const STORAGE_KEY = 'yui_chat_dat';

describe('chatApi', () => {
  const mockLogs: Chat[] = [
    { id: '1', message: 'A' },
    { id: '2', message: 'B' },
  ];

  beforeEach(() => {
    localStorage.clear();
  });

  it('should return empty array if no data', () => {
    expect(loadChatLogs()).toEqual([]);
  });

  it('should load saved chat logs', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mockLogs));
    expect(loadChatLogs()).toEqual(mockLogs);
  });

  it('should return empty array if storage data is not an array', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: 'array' }));
    expect(loadChatLogs()).toEqual([]);
  });

  it('should return empty array if data is invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{invalid');
    expect(loadChatLogs()).toEqual([]);
  });

  it('should save and load chat logs with saveChatLogs', () => {
    saveChatLogs(mockLogs);
    expect(loadChatLogs()).toEqual(mockLogs);
  });

  it('should not save more than 2000 items', () => {
    const bigLogs = Array.from({ length: 2500 }, (_, i) => ({ id: String(i), message: String(i) }));
    saveChatLogs(bigLogs);
    expect(loadChatLogs().length).toBe(2000);
  });

  it('should clear chat logs', () => {
    saveChatLogs(mockLogs);
    clearChatLogs();
    expect(loadChatLogs()).toEqual([]);
  });
});
