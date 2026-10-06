import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Chat } from '@features/chat/types';
import { filterByIp } from './ipFilter';

function chat(uuid: string, ip: string, extra: Partial<Chat> = {}): Chat {
  return { uuid, time: 0, name: 'n', color: '#000', message: 'm', ip_masked: ip, ua: '', ...extra };
}

describe('filterByIp', () => {
  it('フィルタが空なら、受け取った配列をそのまま返す', () => {
    const log = [chat('1', 'a')];
    const result = filterByIp(log, new Set());
    expect(result.visible).toBe(log);
    expect(result.hiddenTotal).toBe(0);
  });

  it('一致する発言を除き、IP ごとの件数を数える。管理人の入退室も一致すれば隠す', () => {
    const log = [
      chat('1', 'a'),
      chat('2', 'b'),
      chat('3', 'a', { metadata: { version: 1, kind: 'admin' } }),
      chat('4', ''),
      chat('5', 'c'),
    ];
    const result = filterByIp(log, new Set(['a', 'c']));
    expect(result.visible.map((c) => c.uuid)).toEqual(['2', '4']);
    expect(Object.fromEntries(result.hiddenCounts)).toEqual({ a: 2, c: 1 });
    expect(result.hiddenTotal).toBe(3);
  });

  it('順序を保ち、隠した件数の合計は元の件数から残った件数を引いたもの', () => {
    const ips = ['a', 'b', 'c', '', '*'];
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...ips), { maxLength: 60 }),
        fc.subarray(ips),
        (logIps, filtered) => {
          const log = logIps.map((ip, i) => chat(String(i), ip));
          const result = filterByIp(log, new Set(filtered));
          const expected = log.filter((c) => !(c.ip_masked && filtered.includes(c.ip_masked)));
          expect(result.visible).toEqual(expected);
          const sum = [...result.hiddenCounts.values()].reduce((a, b) => a + b, 0);
          expect(sum).toBe(result.hiddenTotal);
          expect(result.hiddenTotal).toBe(log.length - result.visible.length);
        }
      )
    );
  });
});
