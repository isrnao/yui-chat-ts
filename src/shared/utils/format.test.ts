import { describe, test, expect } from 'vitest';
import { formatTime, formatCountTime } from './format';

describe('formatTime', () => {
  test('時刻を「HH:mm:ss」形式で返す', () => {
    const date = new Date('2024-06-15T07:08:09.000Z');
    expect(formatTime(date.getTime())).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

describe('formatCountTime', () => {
  test('日付＋曜日＋時刻を正しく整形する', () => {
    const date = new Date('2024-06-16T05:23:45.000Z');
    const ts = date.getTime();
    // バックスラッシュは一つでOK
    expect(formatCountTime(ts)).toMatch(/\d{1,2}\/\d{1,2}\([日月火水木金土]\)\d{2}:\d{2}/);
  });
});
