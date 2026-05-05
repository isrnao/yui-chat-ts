import { describe, expect, it } from 'vitest';
import { aggregateCountsFromRows } from './roomCountsApi';
import type { ChatMetadata } from '@features/chat/types';

type Row = {
  room_id: string | null;
  name: string | null;
  message: string | null;
  system: boolean | null;
  metadata: ChatMetadata | null;
  time: number | null;
};

const speak = (roomId: string, name: string, time: number): Row => ({
  room_id: roomId,
  name,
  message: 'hello',
  system: false,
  metadata: null,
  time,
});

const systemRow = (roomId: string, name: string, time: number): Row => ({
  room_id: roomId,
  name,
  message: 'system',
  system: true,
  metadata: null,
  time,
});

const adminRow = (roomId: string, time: number): Row => ({
  room_id: roomId,
  name: null,
  message: 'alice さん、Welcome to お気楽チャット',
  system: true,
  metadata: { version: 1, kind: 'admin' },
  time,
});

describe('aggregateCountsFromRows', () => {
  it('counts unique speakers per room', () => {
    const rows: Row[] = [
      speak('superbeginner', 'alice', 1),
      speak('superbeginner', 'bob', 2),
      speak('superbeginner', 'alice', 3), // 重複
      speak('ofall', 'carol', 4),
    ];

    expect(aggregateCountsFromRows(rows)).toEqual({
      superbeginner: 2, // alice, bob
      ofall: 1,
    });
  });

  it('ignores system messages and admin announcements', () => {
    const rows: Row[] = [
      adminRow('superbeginner', 1),
      systemRow('superbeginner', 'alice', 2),
      speak('superbeginner', 'bob', 3),
    ];

    // 通常発言者 bob のみカウント
    expect(aggregateCountsFromRows(rows)).toEqual({ superbeginner: 1 });
  });

  it('drops rows with unknown room_id', () => {
    const rows: Row[] = [speak('superbeginner', 'alice', 1), speak('does-not-exist', 'zz', 2)];

    expect(aggregateCountsFromRows(rows)).toEqual({ superbeginner: 1 });
  });

  it('treats users who later stopped speaking as still counted within the window', () => {
    // 「退室後も 6 時間ウィンドウ内なら活動ユーザーとしてカウントする」仕様
    const rows: Row[] = [
      speak('superbeginner', 'alice', 1),
      speak('superbeginner', 'alice', 2),
      speak('superbeginner', 'bob', 3),
    ];

    expect(aggregateCountsFromRows(rows)).toEqual({ superbeginner: 2 });
  });

  it('returns empty object for empty input', () => {
    expect(aggregateCountsFromRows([])).toEqual({});
  });

  it('skips rows without name', () => {
    const rows: Row[] = [
      { ...speak('superbeginner', '', 1), name: '' },
      { ...speak('superbeginner', null as unknown as string, 2), name: null },
      speak('superbeginner', 'alice', 3),
    ];

    expect(aggregateCountsFromRows(rows)).toEqual({ superbeginner: 1 });
  });
});
