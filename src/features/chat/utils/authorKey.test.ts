import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthorKey, resetAuthorKeyForTest } from './authorKey';

describe('getAuthorKey', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAuthorKeyForTest();
  });

  it('base64url の 43 文字（32 バイト）を作り、localStorage に保存して同じ値を返す', () => {
    const key = getAuthorKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(localStorage.getItem('yui-chat:author-key')).toBe(key);
    resetAuthorKeyForTest();
    expect(getAuthorKey()).toBe(key);
  });

  it('端末ごとに違う鍵になる', () => {
    const first = getAuthorKey();
    localStorage.clear();
    resetAuthorKeyForTest();
    expect(getAuthorKey()).not.toBe(first);
  });

  it('形の違う値が保存されていたら作り直す', () => {
    localStorage.setItem('yui-chat:author-key', 'broken');
    expect(getAuthorKey()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('localStorage が使えなくても、ページを開いている間は同じ鍵を使う', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    try {
      const key = getAuthorKey();
      expect(getAuthorKey()).toBe(key);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
