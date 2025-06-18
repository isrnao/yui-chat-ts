import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChatRanking } from './useChatRanking';
import type { Chat } from '@features/chat/types';

describe('useChatRanking', () => {
  it('should return empty array for empty chat log', () => {
    const { result } = renderHook(() => useChatRanking([]));
    expect(result.current).toEqual([]);
  });

  it('should filter out system messages and messages without name', () => {
    const chatLog: Chat[] = [
      {
        id: '1',
        name: '',
        color: '#000',
        message: 'test',
        time: 100,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        id: '2',
        name: 'User1',
        color: '#000',
        message: 'test',
        time: 200,
        system: true,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        id: '3',
        name: 'User2',
        color: '#000',
        message: 'test',
        time: 300,
        ip: 'test-ip',
        ua: 'test-ua',
      },
    ];

    const { result } = renderHook(() => useChatRanking(chatLog));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toEqual({
      name: 'User2',
      count: 1,
      lastTime: 300,
    });
  });

  it('should count messages per user', () => {
    const chatLog: Chat[] = [
      {
        id: '1',
        name: 'User1',
        color: '#000',
        message: 'test1',
        time: 100,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        id: '2',
        name: 'User2',
        color: '#000',
        message: 'test2',
        time: 200,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        id: '3',
        name: 'User1',
        color: '#000',
        message: 'test3',
        time: 300,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        id: '4',
        name: 'User1',
        color: '#000',
        message: 'test4',
        time: 400,
        ip: 'test-ip',
        ua: 'test-ua',
      },
    ];

    const { result } = renderHook(() => useChatRanking(chatLog));
    expect(result.current).toHaveLength(2);

    const user1 = result.current.find((r) => r.name === 'User1');
    const user2 = result.current.find((r) => r.name === 'User2');

    expect(user1).toEqual({ name: 'User1', count: 3, lastTime: 400 });
    expect(user2).toEqual({ name: 'User2', count: 1, lastTime: 200 });
  });

  it('should sort by count descending, then by lastTime descending', () => {
    const chatLog: Chat[] = [
      {
        id: '1',
        name: 'User1',
        color: '#000',
        message: 'test1',
        time: 100,
        ip: 'test-ip',
        ua: 'test-ua',
      }, // count: 1, lastTime: 100
      {
        id: '2',
        name: 'User2',
        color: '#000',
        message: 'test2',
        time: 200,
        ip: 'test-ip',
        ua: 'test-ua',
      }, // count: 2, lastTime: 300
      {
        id: '3',
        name: 'User3',
        color: '#000',
        message: 'test3',
        time: 400,
        ip: 'test-ip',
        ua: 'test-ua',
      }, // count: 2, lastTime: 500
      {
        id: '4',
        name: 'User2',
        color: '#000',
        message: 'test4',
        time: 300,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        id: '5',
        name: 'User3',
        color: '#000',
        message: 'test5',
        time: 500,
        ip: 'test-ip',
        ua: 'test-ua',
      },
    ];

    const { result } = renderHook(() => useChatRanking(chatLog));
    expect(result.current).toHaveLength(3);

    // User3とUser2は同じcount(2)だが、User3のlastTime(500) > User2のlastTime(300)なのでUser3が先
    expect(result.current[0]).toEqual({ name: 'User3', count: 2, lastTime: 500 });
    expect(result.current[1]).toEqual({ name: 'User2', count: 2, lastTime: 300 });
    expect(result.current[2]).toEqual({ name: 'User1', count: 1, lastTime: 100 });
  });

  it('should update ranking when chat log changes', () => {
    const initialChatLog: Chat[] = [
      {
        id: '1',
        name: 'User1',
        color: '#000',
        message: 'test1',
        time: 100,
        ip: 'test-ip',
        ua: 'test-ua',
      },
    ];

    const { result, rerender } = renderHook(({ chatLog }) => useChatRanking(chatLog), {
      initialProps: { chatLog: initialChatLog },
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toEqual({ name: 'User1', count: 1, lastTime: 100 });

    const updatedChatLog: Chat[] = [
      ...initialChatLog,
      {
        id: '2',
        name: 'User2',
        color: '#000',
        message: 'test2',
        time: 200,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        id: '3',
        name: 'User2',
        color: '#000',
        message: 'test3',
        time: 300,
        ip: 'test-ip',
        ua: 'test-ua',
      },
    ];

    rerender({ chatLog: updatedChatLog });
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toEqual({ name: 'User2', count: 2, lastTime: 300 });
    expect(result.current[1]).toEqual({ name: 'User1', count: 1, lastTime: 100 });
  });

  it('should handle users with same count and same lastTime', () => {
    const chatLog: Chat[] = [
      {
        id: '1',
        name: 'User1',
        color: '#000',
        message: 'test1',
        time: 100,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        id: '2',
        name: 'User2',
        color: '#000',
        message: 'test2',
        time: 100,
        ip: 'test-ip',
        ua: 'test-ua',
      },
    ];

    const { result } = renderHook(() => useChatRanking(chatLog));
    expect(result.current).toHaveLength(2);

    // 同じcount、同じlastTimeの場合、順序は配列の元の順序に依存する可能性がある
    expect(result.current.every((r) => r.count === 1 && r.lastTime === 100)).toBe(true);
  });

  it('should track lastTime correctly for multiple messages from same user', () => {
    const chatLog: Chat[] = [
      {
        id: '1',
        name: 'User1',
        color: '#000',
        message: 'test1',
        time: 100,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        id: '2',
        name: 'User1',
        color: '#000',
        message: 'test2',
        time: 50,
        ip: 'test-ip',
        ua: 'test-ua',
      }, // 古い時間
      {
        id: '3',
        name: 'User1',
        color: '#000',
        message: 'test3',
        time: 200,
        ip: 'test-ip',
        ua: 'test-ua',
      }, // 最新時間
    ];

    const { result } = renderHook(() => useChatRanking(chatLog));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toEqual({ name: 'User1', count: 3, lastTime: 200 });
  });

  it('should handle empty names correctly', () => {
    const chatLog: Chat[] = [
      {
        id: '1',
        name: '',
        color: '#000',
        message: 'test1',
        time: 100,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        id: '2',
        name: null as any,
        color: '#000',
        message: 'test2',
        time: 200,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        id: '3',
        name: undefined as any,
        color: '#000',
        message: 'test3',
        time: 300,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        id: '4',
        name: 'ValidUser',
        color: '#000',
        message: 'test4',
        time: 400,
        ip: 'test-ip',
        ua: 'test-ua',
      },
    ];

    const { result } = renderHook(() => useChatRanking(chatLog));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]).toEqual({ name: 'ValidUser', count: 1, lastTime: 400 });
  });

  it('should handle mixed system and regular messages', () => {
    const chatLog: Chat[] = [
      {
        id: '1',
        name: 'User1',
        color: '#000',
        message: 'regular',
        time: 100,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        id: '2',
        name: 'System',
        color: '#000',
        message: 'system msg',
        time: 200,
        system: true,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        id: '3',
        name: 'User1',
        color: '#000',
        message: 'another regular',
        time: 300,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        id: '4',
        name: 'User2',
        color: '#000',
        message: 'regular2',
        time: 400,
        system: false,
        ip: 'test-ip',
        ua: 'test-ua',
      },
    ];

    const { result } = renderHook(() => useChatRanking(chatLog));
    expect(result.current).toHaveLength(2);
    expect(result.current[0]).toEqual({ name: 'User1', count: 2, lastTime: 300 });
    expect(result.current[1]).toEqual({ name: 'User2', count: 1, lastTime: 400 });
  });

  it('should handle very large chat logs efficiently', () => {
    const largeChatLog: Chat[] = Array.from({ length: 1000 }, (_, i) => ({
      id: String(i),
      name: `User${i % 100}`, // 100人のユーザーが10回ずつ投稿
      color: '#000000',
      message: `Message ${i}`,
      time: i * 1000,
      ip: 'test-ip',
      ua: 'test-ua',
    }));

    const { result } = renderHook(() => useChatRanking(largeChatLog));

    expect(result.current).toHaveLength(100);
    expect(result.current[0].count).toBe(10);
    // 最初のユーザーの最後の投稿時刻を確認
    expect(result.current.find((r) => r.name === 'User0')?.lastTime).toBe(900000);
  });

  it('should return stable results for same input', () => {
    const chatLog: Chat[] = [
      {
        id: '1',
        name: 'User1',
        color: '#000',
        message: 'test1',
        time: 100,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        id: '2',
        name: 'User2',
        color: '#000',
        message: 'test2',
        time: 200,
        ip: 'test-ip',
        ua: 'test-ua',
      },
    ];

    const { result, rerender } = renderHook(({ chatLog }) => useChatRanking(chatLog), {
      initialProps: { chatLog },
    });

    const firstResult = result.current;

    // 同じデータで再レンダリング
    rerender({ chatLog });

    expect(result.current).toEqual(firstResult);
  });
});
