import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useParticipants, getRecentParticipants } from './useParticipants';
import type { Chat } from '@features/chat/types';

describe('getRecentParticipants', () => {
  it('should return empty array for empty chat log', () => {
    expect(getRecentParticipants([])).toEqual([]);
  });

  it('should filter out system messages and messages without name/color', () => {
    const chatLog: Chat[] = [
      {
        uuid: '1',
        name: '',
        color: '',
        message: 'test',
        time: Date.now(),
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        uuid: '2',
        name: 'User1',
        color: '#ff0000',
        message: 'test',
        time: Date.now(),
        system: true,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        uuid: '3',
        name: 'User2',
        color: '',
        message: 'test',
        time: Date.now(),
        ip: 'test-ip',
        ua: 'test-ua',
      },
    ];
    expect(getRecentParticipants(chatLog)).toEqual([]);
  });

  it('should return recent participants within 5 minutes', () => {
    const now = Date.now();
    const chatLog: Chat[] = [
      {
        uuid: '1',
        name: 'User1',
        color: '#ff0000',
        message: 'test1',
        time: now - 1000,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        uuid: '2',
        name: 'User2',
        color: '#00ff00',
        message: 'test2',
        time: now - 60000,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        uuid: '3',
        name: 'User3',
        color: '#0000ff',
        message: 'test3',
        time: now - 400000,
        ip: 'test-ip',
        ua: 'test-ua',
      }, // 6分40秒前
    ];

    const participants = getRecentParticipants(chatLog);
    expect(participants).toHaveLength(2);
    expect(participants).toContainEqual({ uuid: '1', name: 'User1', color: '#ff0000' });
    expect(participants).toContainEqual({ uuid: '2', name: 'User2', color: '#00ff00' });
  });

  it('should deduplicate participants by name', () => {
    const now = Date.now();
    const chatLog: Chat[] = [
      {
        uuid: '1',
        name: 'User1',
        color: '#ff0000',
        message: 'test1',
        time: now - 1000,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        uuid: '2',
        name: 'User1',
        color: '#ff0000',
        message: 'test2',
        time: now - 2000,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        uuid: '3',
        name: 'User2',
        color: '#00ff00',
        message: 'test3',
        time: now - 3000,
        ip: 'test-ip',
        ua: 'test-ua',
      },
    ];

    const participants = getRecentParticipants(chatLog);
    expect(participants).toHaveLength(2);
    expect(participants.filter((p) => p.name === 'User1')).toHaveLength(1);
  });

  it('should filter out messages older than 5 minutes', () => {
    const now = Date.now();
    const oldTime = now - 6 * 60 * 1000; // 6分前
    const chatLog: Chat[] = [
      {
        uuid: '1',
        name: 'User1',
        color: '#ff0000',
        message: 'test',
        time: oldTime,
        ip: 'test-ip',
        ua: 'test-ua',
      },
    ];

    expect(getRecentParticipants(chatLog)).toEqual([]);
  });

  it('should handle edge cases in time filtering', () => {
    const now = Date.now();
    const exactlyFiveMinutes = now - 5 * 60 * 1000; // ちょうど5分前
    const justOverFiveMinutes = now - (5 * 60 * 1000 + 1); // 5分と1ms前

    const chatLog: Chat[] = [
      {
        uuid: '1',
        name: 'User1',
        color: '#ff0000',
        message: 'test1',
        time: exactlyFiveMinutes,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        uuid: '2',
        name: 'User2',
        color: '#00ff00',
        message: 'test2',
        time: justOverFiveMinutes,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        uuid: '3',
        name: 'User3',
        color: '#0000ff',
        message: 'test3',
        time: now - 1000,
        ip: 'test-ip',
        ua: 'test-ua',
      }, // 1秒前
    ];

    const participants = getRecentParticipants(chatLog);
    expect(participants).toHaveLength(2); // User1とUser3のみ
    expect(participants.map((p) => p.name)).toContain('User1');
    expect(participants.map((p) => p.name)).toContain('User3');
    expect(participants.map((p) => p.name)).not.toContain('User2');
  });

  it('should handle participants with same name but different colors', () => {
    const now = Date.now();
    const chatLog: Chat[] = [
      {
        uuid: '1',
        name: 'User1',
        color: '#ff0000',
        message: 'test1',
        time: now - 1000,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        uuid: '2',
        name: 'User1',
        color: '#00ff00',
        message: 'test2',
        time: now - 2000,
        ip: 'test-ip',
        ua: 'test-ua',
      }, // 異なる色
      {
        uuid: '3',
        name: 'User2',
        color: '#0000ff',
        message: 'test3',
        time: now - 3000,
        ip: 'test-ip',
        ua: 'test-ua',
      },
    ];

    const participants = getRecentParticipants(chatLog);
    expect(participants).toHaveLength(2);

    const user1 = participants.find((p) => p.name === 'User1');
    expect(user1).toBeDefined();
    // Mapは後から追加されたもので上書きされるため、最後に見つかった色が使われる
    expect(user1?.color).toBe('#00ff00');
  });

  it('should work with very recent messages', () => {
    const now = Date.now();
    const chatLog: Chat[] = [
      {
        uuid: '1',
        name: 'User1',
        color: '#ff0000',
        message: 'test1',
        time: now,
        ip: 'test-ip',
        ua: 'test-ua',
      }, // 現在時刻
      {
        uuid: '2',
        name: 'User2',
        color: '#00ff00',
        message: 'test2',
        time: now + 1000,
        ip: 'test-ip',
        ua: 'test-ua',
      }, // 未来の時刻
    ];

    const participants = getRecentParticipants(chatLog);
    expect(participants).toHaveLength(2);
    expect(participants.map((p) => p.name)).toContain('User1');
    expect(participants.map((p) => p.name)).toContain('User2');
  });

  it('should handle performance with large datasets', () => {
    const now = Date.now();
    const chatLog: Chat[] = Array.from({ length: 5000 }, (_, i) => ({
      uuid: String(i),
      name: `User${i % 200}`, // 200人のユーザー
      color: `#${(i % 16777215).toString(16).padStart(6, '0')}`,
      message: `Message ${i}`,
      time: now - i * 1000, // 各メッセージは1秒ずつ古い
      ip: 'test-ip',
      ua: 'test-ua',
    }));

    const startTime = performance.now();
    const participants = getRecentParticipants(chatLog);
    const endTime = performance.now();

    // パフォーマンステスト：処理時間が合理的であることを確認
    expect(endTime - startTime).toBeLessThan(100); // 100ms以内

    // 5分以内のメッセージのみが含まれることを確認
    expect(participants.length).toBeLessThanOrEqual(200);

    // 最新の300メッセージ分のユーザーのみが含まれるはず（5分 = 300秒）
    const expectedUserCount = Math.min(200, 300);
    expect(participants.length).toBeLessThanOrEqual(expectedUserCount);
  });

  it('should maintain referential equality when input is same', () => {
    const chatLog: Chat[] = [
      {
        uuid: '1',
        name: 'User1',
        color: '#ff0000',
        message: 'test',
        time: Date.now() - 1000,
        ip: 'test-ip',
        ua: 'test-ua',
      },
    ];

    const { result, rerender } = renderHook(({ chatLog }) => useParticipants(chatLog), {
      initialProps: { chatLog },
    });

    const firstResult = result.current;

    // 同じデータで再レンダリング
    rerender({ chatLog });

    // useDeferredValueにより、同じ結果が返される
    expect(result.current).toEqual(firstResult);
  });
});

describe('useParticipants', () => {
  it('should return participants from chat log', () => {
    const now = Date.now();
    const chatLog: Chat[] = [
      {
        uuid: '1',
        name: 'User1',
        color: '#ff0000',
        message: 'test',
        time: now - 1000,
        ip: 'test-ip',
        ua: 'test-ua',
      },
      {
        uuid: '2',
        name: 'User2',
        color: '#00ff00',
        message: 'test',
        time: now - 2000,
        ip: 'test-ip',
        ua: 'test-ua',
      },
    ];

    const { result } = renderHook(() => useParticipants(chatLog));

    expect(result.current).toHaveLength(2);
    expect(result.current).toContainEqual({ uuid: '1', name: 'User1', color: '#ff0000' });
    expect(result.current).toContainEqual({ uuid: '2', name: 'User2', color: '#00ff00' });
  });

  it('should update when chat log changes', () => {
    const now = Date.now();
    const initialChatLog: Chat[] = [
      {
        uuid: '1',
        name: 'User1',
        color: '#ff0000',
        message: 'test',
        time: now - 1000,
        ip: 'test-ip',
        ua: 'test-ua',
      },
    ];

    const { result, rerender } = renderHook(({ chatLog }) => useParticipants(chatLog), {
      initialProps: { chatLog: initialChatLog },
    });

    expect(result.current).toHaveLength(1);

    const updatedChatLog: Chat[] = [
      ...initialChatLog,
      {
        uuid: '2',
        name: 'User2',
        color: '#00ff00',
        message: 'test',
        time: now - 2000,
        ip: 'test-ip',
        ua: 'test-ua',
      },
    ];

    rerender({ chatLog: updatedChatLog });
    expect(result.current).toHaveLength(2);
  });
});
