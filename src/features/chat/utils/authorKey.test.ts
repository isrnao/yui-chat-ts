import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = /^[A-Za-z0-9_-]{43}$/;

/** 別のタブ（モジュールの状態が別）として読み込む */
async function loadTab() {
  vi.resetModules();
  return import('./authorKey');
}

describe('getAuthorKey', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('base64url の 43 文字（32 バイト）を作り、localStorage に保存して同じ値を返す', async () => {
    const tab = await loadTab();
    const key = tab.getAuthorKey();
    expect(key).toMatch(KEY);
    expect(localStorage.getItem('yui-chat:author-key')).toBe(key);
    expect((await loadTab()).getAuthorKey()).toBe(key);
  });

  it('形の違う値が保存されていたら作り直す', async () => {
    localStorage.setItem('yui-chat:author-key', 'broken');
    expect((await loadTab()).getAuthorKey()).toMatch(KEY);
  });

  it('別のタブが保存した鍵に追随する', async () => {
    const tab = await loadTab();
    tab.getAuthorKey();
    const other = 'B'.repeat(43);
    localStorage.setItem('yui-chat:author-key', other);
    expect(tab.getAuthorKey()).toBe(other);
  });

  it('localStorage が使えなくても、ページを開いている間は同じ鍵を使う', async () => {
    const tab = await loadTab();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const key = tab.getAuthorKey();
    expect(key).toMatch(KEY);
    expect(tab.getAuthorKey()).toBe(key);
  });
});
