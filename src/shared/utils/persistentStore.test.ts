import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPersistentStore } from './persistentStore';

type Value = { name: string; count: number };
const defaults: Value = { name: '', count: 0 };

function makeStore(key = 'test-store') {
  return createPersistentStore<Value>({
    key,
    defaults,
    parse: (value) => {
      const v = value as Partial<Value>;
      return {
        name: typeof v.name === 'string' ? v.name : '',
        count: typeof v.count === 'number' ? v.count : 0,
      };
    },
  });
}

describe('createPersistentStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('生の文字列が変わらない限り、getSnapshot は同じ参照を返す', () => {
    localStorage.setItem('test-store', JSON.stringify({ name: 'ゆい', count: 1 }));
    const store = makeStore();
    const first = store.getSnapshot();
    expect(first).toEqual({ name: 'ゆい', count: 1 });
    expect(store.getSnapshot()).toBe(first);
  });

  it('値がなければ既定値、壊れた JSON も既定値にする', () => {
    expect(makeStore().getSnapshot()).toBe(defaults);
    localStorage.setItem('test-store', '{broken');
    expect(makeStore().getSnapshot()).toBe(defaults);
  });

  it('getServerSnapshot は保存された値に関係なく既定値を返す', () => {
    localStorage.setItem('test-store', JSON.stringify({ name: 'ゆい', count: 1 }));
    expect(makeStore().getServerSnapshot()).toBe(defaults);
  });

  it('update は保存して購読者へ通知し、関数なら現在値から次の値を作る', () => {
    const store = makeStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.update({ name: 'ゆい', count: 1 });
    store.update((previous) => ({ ...previous, count: previous.count + 1 }));

    expect(store.getSnapshot()).toEqual({ name: 'ゆい', count: 2 });
    expect(JSON.parse(localStorage.getItem('test-store')!)).toEqual({ name: 'ゆい', count: 2 });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('別タブでの変更（storage イベント）に追随する', () => {
    const store = makeStore();
    const listener = vi.fn();
    store.subscribe(listener);

    localStorage.setItem('test-store', JSON.stringify({ name: 'たろう', count: 5 }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'test-store' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'other-key' }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({ name: 'たろう', count: 5 });
  });

  it('localStorage に書けなくても、メモリ上の値で動き続ける', () => {
    const store = makeStore();
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      store.update({ name: 'ゆい', count: 1 });
      expect(store.getSnapshot()).toEqual({ name: 'ゆい', count: 1 });
    } finally {
      setItem.mockRestore();
    }
  });
});
