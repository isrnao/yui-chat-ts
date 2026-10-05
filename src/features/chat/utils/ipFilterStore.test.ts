import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FILTER_LIST_LIMIT,
  FILTER_NAMES_LIMIT,
  addFilteredIp,
  getFilteredIps,
  addFilteredName,
  addFilteredWord,
  clearFilters,
  filterKey,
  removeFilter,
  getServerSnapshot,
  getSnapshot,
  isFilterableIp,
  removeFilteredIp,
  subscribe,
} from './ipFilterStore';

const KEY = 'yui-chat-muted-ips';

describe('ipFilterStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('空文字と * はフィルタの起点にできない', () => {
    expect(isFilterableIp('219.*.*.253')).toBe(true);
    expect(isFilterableIp('2001:*')).toBe(true);
    expect(isFilterableIp('')).toBe(false);
    expect(isFilterableIp('*')).toBe(false);
    expect(isFilterableIp(undefined)).toBe(false);
  });

  it('追加した順に末尾へ並べ、localStorage に保存する', () => {
    addFilteredIp('219.*.*.253');
    addFilteredIp('2001:*');
    expect(getFilteredIps()).toEqual(['219.*.*.253', '2001:*']);
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual([
      { kind: 'ip', ip: '219.*.*.253', names: [] },
      { kind: 'ip', ip: '2001:*', names: [] },
    ]);
  });

  it('すでにある IP と、起点にできない値は追加しない', () => {
    addFilteredIp('219.*.*.253');
    const before = getSnapshot();
    addFilteredIp('219.*.*.253');
    addFilteredIp('*');
    addFilteredIp('');
    expect(getFilteredIps()).toEqual(['219.*.*.253']);
    expect(getSnapshot()).toBe(before);
  });

  it(`${FILTER_LIST_LIMIT} 件を超えたら古いものから捨てる`, () => {
    for (let i = 0; i <= FILTER_LIST_LIMIT; i += 1) addFilteredIp(`10.*.*.${i}`);
    const ips = getFilteredIps();
    expect(ips).toHaveLength(FILTER_LIST_LIMIT);
    expect(ips[0]).toBe('10.*.*.1');
    expect(ips[ips.length - 1]).toBe(`10.*.*.${FILTER_LIST_LIMIT}`);
  });

  it('解除とすべて解除', () => {
    addFilteredIp('a');
    addFilteredIp('b');
    removeFilteredIp('a');
    expect(getFilteredIps()).toEqual(['b']);
    clearFilters();
    expect(getFilteredIps()).toEqual([]);
  });

  it('壊れた保存値や形の違う値は、使える文字列だけを残して読む', () => {
    localStorage.setItem(KEY, '{not json');
    expect(getFilteredIps()).toEqual([]);
    localStorage.setItem(KEY, JSON.stringify({ ips: ['a'] }));
    expect(getFilteredIps()).toEqual([]);
    localStorage.setItem(KEY, JSON.stringify(['a', 1, null, '', '*', 'a', 'b']));
    expect(getFilteredIps()).toEqual(['a', 'b']);
  });

  it('フィルタした時点の「おなまえ」を保存し、同じ IP をもう一度足すと名前だけを前に足す', () => {
    addFilteredIp('a', ['たろう', 'じろう']);
    expect(getSnapshot()).toEqual([{ kind: 'ip', ip: 'a', names: ['たろう', 'じろう'] }]);
    addFilteredIp('a', ['はなこ', 'たろう']);
    expect(getSnapshot()).toEqual([{ kind: 'ip', ip: 'a', names: ['はなこ', 'たろう', 'じろう'] }]);
    const before = getSnapshot();
    addFilteredIp('a', ['じろう']);
    expect(getSnapshot()).toBe(before);
  });

  it(`「おなまえ」は 1 つの IP につき ${FILTER_NAMES_LIMIT} 人まで`, () => {
    addFilteredIp(
      'a',
      Array.from({ length: FILTER_NAMES_LIMIT + 2 }, (_, i) => `n${i}`)
    );
    const [entry] = getSnapshot();
    expect(entry?.kind === 'ip' && entry.names).toHaveLength(FILTER_NAMES_LIMIT);
  });

  it('名前を保存する前の形（IP の文字列だけ）と、新しい形が混ざっていても読む', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify(['a', { ip: 'b', names: ['たろう', 1, ''] }, { ip: '*' }, { names: [] }, 'a'])
    );
    expect(getSnapshot()).toEqual([
      { kind: 'ip', ip: 'a', names: [] },
      { kind: 'ip', ip: 'b', names: ['たろう'] },
    ]);
  });

  it('名前と言葉も保存し、IP と合わせて追加した順に並べる。言葉は前後の空白を除く', () => {
    addFilteredIp('a');
    addFilteredName('たろう');
    addFilteredWord('  うざい  ');
    addFilteredName('たろう');
    addFilteredWord('うざい');
    addFilteredWord('   ');
    expect(getSnapshot()).toEqual([
      { kind: 'ip', ip: 'a', names: [] },
      { kind: 'name', name: 'たろう' },
      { kind: 'word', word: 'うざい' },
    ]);
    expect(getFilteredIps()).toEqual(['a']);
  });

  it('filterKey で 1 件ずつ解除できる', () => {
    addFilteredIp('a');
    addFilteredName('a');
    addFilteredWord('a');
    removeFilter(filterKey({ kind: 'name', name: 'a' }));
    expect(getSnapshot().map(filterKey)).toEqual(['ip:a', 'word:a']);
  });

  it('種類を持つ形と持たない古い形が混ざっていても読み、使えないものは捨てる', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        'a',
        { kind: 'name', name: 'たろう' },
        { kind: 'word', word: ' x ' },
        { kind: 'name', name: '  ' },
        { kind: 'word', word: '' },
        { kind: 'other', ip: 'b' },
      ])
    );
    expect(getSnapshot()).toEqual([
      { kind: 'ip', ip: 'a', names: [] },
      { kind: 'name', name: 'たろう' },
      { kind: 'word', word: 'x' },
    ]);
  });

  it('SSG と hydration の間は空', () => {
    addFilteredIp('a');
    expect(getServerSnapshot()).toEqual([]);
  });

  it('同じタブの変更と、別のタブの storage イベントを購読者へ知らせる', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    addFilteredIp('a');
    expect(listener).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    expect(listener).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new StorageEvent('storage', { key: 'other-key' }));
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
