import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Chat } from '@features/chat/types';
import { countWordMatches, filterByIp, speakerName } from './ipFilter';
import { buildAdminChat } from '../serverMessages';

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
    expect(Object.fromEntries(result.hiddenCounts)).toEqual({ 'ip:a': 2, 'ip:c': 1 });
    expect(result.hiddenTotal).toBe(3);
  });

  it('IP ごとに隠した発言の「おなまえ」を、新しい順で重複なく集める。管理人は本文の入室者、巫女は数えない', () => {
    const log = [
      chat('1', 'a', { name: 'たろう' }),
      chat('2', 'a', {
        name: '管理人',
        message: 'じろう さん、Welcome to お気楽チャット☆',
        metadata: { version: 1, kind: 'admin' },
      }),
      chat('3', 'a', { name: '巫女', metadata: { version: 1, kind: 'fortune' } }),
      chat('4', 'a', { name: 'たろう' }),
      chat('5', 'b', { name: 'はなこ' }),
      chat('6', 'c', { name: 'さぶろう' }),
    ];
    const result = filterByIp(log, new Set(['a', 'b']));
    expect(result.hiddenNames.get('a')).toEqual(['たろう', 'じろう']);
    expect(result.hiddenNames.get('b')).toEqual(['はなこ']);
    expect(result.hiddenNames.has('c')).toBe(false);
  });

  it('名前（入退室の入室者を含む）と言葉（全角半角・大文字小文字を区別しない）でも隠し、件数は filterKey ごと', () => {
    const log = [
      chat('1', 'x', { name: 'たろう', message: 'ＨＥＬＬＯ' }),
      chat('2', 'y', {
        name: '管理人',
        message: 'たろう さん、Welcome to お気楽チャット☆',
        metadata: { version: 1, kind: 'admin' },
      }),
      chat('3', 'z', { name: 'じろう', message: 'say hello' }),
      chat('4', 'w', { name: 'はなこ', message: 'bye' }),
    ];
    const result = filterByIp(log, {
      set: new Set(),
      names: new Set(['たろう']),
      words: ['hello'],
    });
    expect(result.visible.map((c) => c.uuid)).toEqual(['4']);
    expect(Object.fromEntries(result.hiddenCounts)).toEqual({ 'name:たろう': 2, 'word:hello': 2 });
    expect(result.hiddenTotal).toBe(3);
    // 管理人の入退室（定型文）には言葉を当てない
    expect(countWordMatches(log, 'welcome')).toBe(0);
    expect(countWordMatches(log, ' Hello ')).toBe(2);
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

describe('speakerName（入退室は metadata の構造で読む。Issue #183）', () => {
  it('構造のある入退室の行は、名前に「さん、」を含んでも subject の名前にする', () => {
    const admin = {
      ...chat('1', 'a'),
      ...buildAdminChat({ event: 'exit', name: 'Aさん、B', color: '#f00' }),
    };
    expect(speakerName(admin)).toBe('Aさん、B');
  });

  it('構造のある行は、文言が変わっても subject の名前にする', () => {
    const admin = {
      ...chat('1', 'a'),
      ...buildAdminChat({ event: 'enter', name: 'ゆい', color: '#f00' }),
      message: 'ようこそ',
    };
    expect(speakerName(admin)).toBe('ゆい');
  });

  it('構造の無い古い行は本文で読む', () => {
    const legacy = chat('1', 'a', {
      message: 'たろう さん、Welcome to お気楽チャット☆',
      metadata: { version: 1, kind: 'admin' },
    });
    expect(speakerName(legacy)).toBe('たろう');
  });

  it('名前のフィルタで、構造のある入退室の行も隠す', () => {
    const admin = {
      ...chat('1', 'a'),
      ...buildAdminChat({ event: 'enter', name: 'Aさん、B', color: '#f00' }),
    };
    const result = filterByIp([admin, chat('2', 'b', { name: 'A' })], {
      set: new Set(),
      names: new Set(['Aさん、B']),
    });
    expect(result.visible.map((c) => c.uuid)).toEqual(['2']);
  });
});
