import { describe, it, expect } from 'vitest';
import { generateOperationId, isUUIDv7, sortChatsByTime } from '@shared/utils/uuid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// 時刻の順に並んだ UUID v7（先頭 48 ビットが ms のタイムスタンプ）
const V7_OLD = '01990000-0000-7000-8000-000000000001';
const V7_MID = '01990000-0001-7000-8000-000000000002';
const V7_NEW = '01990000-0002-7000-8000-000000000003';

describe('isUUIDv7', () => {
  it('UUID v7 を判定する', () => {
    expect(isUUIDv7(V7_OLD)).toBe(true);
  });

  it('UUID v7 以外を弾く', () => {
    expect(isUUIDv7('not-a-uuid')).toBe(false);
    expect(isUUIDv7('550e8400-e29b-41d4-a716-446655440000')).toBe(false); // UUID v4
    expect(isUUIDv7('')).toBe(false);
  });
});

describe('sortChatsByTime', () => {
  it('UUID v7 同士は UUID の降順（新しい順）に並べる', () => {
    const sorted = sortChatsByTime([
      { uuid: V7_MID, time: 0 },
      { uuid: V7_OLD, time: 0 },
      { uuid: V7_NEW, time: 0 },
    ]);
    expect(sorted.map((c) => c.uuid)).toEqual([V7_NEW, V7_MID, V7_OLD]);
  });

  it('UUID v7 でないものが混じると time の降順で並べる', () => {
    const sorted = sortChatsByTime([
      { uuid: 'temp-1', time: 1000 },
      { uuid: V7_OLD, time: 2000 },
    ]);
    expect(sorted.map((c) => c.time)).toEqual([2000, 1000]);
  });

  it('入力の配列を書き換えない', () => {
    const input = [
      { uuid: V7_OLD, time: 0 },
      { uuid: V7_NEW, time: 0 },
    ];
    sortChatsByTime(input);
    expect(input[0]!.uuid).toBe(V7_OLD);
  });
});

describe('generateOperationId', () => {
  it('UUID v4 を返し、毎回異なる', () => {
    const ids = Array.from({ length: 100 }, () => generateOperationId());
    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(new Set(ids).size).toBe(100);
  });

  it('crypto.randomUUID がない環境でも UUID v4 を返す', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      expect(generateOperationId()).toMatch(UUID_V4);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});
