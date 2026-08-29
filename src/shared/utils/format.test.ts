import { describe, test, expect } from 'vitest';
import { formatTime, formatCountTime, formatLegacyDateTime, maskIpAddress } from './format';

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

describe('formatLegacyDateTime', () => {
  test('レガシー互換の「MM/DD(Www) HH:mm」形式で返す', () => {
    // ローカルタイム基準で 2013-01-02(水) 20:10
    const ts = new Date(2013, 0, 2, 20, 10, 30).getTime();
    expect(formatLegacyDateTime(ts)).toBe('01/02(Wed) 20:10');
  });

  test('月日・時分をゼロ埋めする', () => {
    const ts = new Date(2024, 8, 5, 9, 4, 0).getTime();
    expect(formatLegacyDateTime(ts)).toBe('09/05(Thu) 09:04');
  });
});

describe('maskIpAddress', () => {
  test('IPv4 の末尾オクテットを伏せる', () => {
    expect(maskIpAddress('219.107.106.253')).toBe('219.107.106.*');
  });

  test('IPv6 は上位3ブロックだけ残す', () => {
    expect(maskIpAddress('2001:db8::1')).toBe('2001:db8::*');
  });

  test('空文字はそのまま返す', () => {
    expect(maskIpAddress('')).toBe('');
  });

  test('想定外の形式は全体を伏せる', () => {
    expect(maskIpAddress('unknown-host')).toBe('*');
  });
});
