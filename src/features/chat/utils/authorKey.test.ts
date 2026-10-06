import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = /^[A-Za-z0-9_-]{43}$/;

/** タブ間で共有する Web Locks の代わり（同じ名前の要求を 1 つずつ順に動かす） */
function installLocks() {
  let tail = Promise.resolve();
  const request = vi.fn(<T>(_name: string, callback: () => Promise<T> | T): Promise<T> => {
    const run = tail.then(() => callback());
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  });
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
  return request;
}

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
    Reflect.deleteProperty(navigator, 'locks');
    vi.restoreAllMocks();
  });

  it('base64url の 43 文字（32 バイト）を作り、localStorage に保存して同じ値を返す', async () => {
    const tab = await loadTab();
    const key = await tab.getAuthorKey();
    expect(key).toMatch(KEY);
    expect(localStorage.getItem('yui-chat:author-key')).toBe(key);
    expect(await (await loadTab()).getAuthorKey()).toBe(key);
  });

  it('形の違う値が保存されていたら作り直す', async () => {
    localStorage.setItem('yui-chat:author-key', 'broken');
    expect(await (await loadTab()).getAuthorKey()).toMatch(KEY);
  });

  it('鍵が無い状態で 2 つのタブが同時に初期化しても、同じ鍵になる（Web Locks で直列化）', async () => {
    const request = installLocks();
    const tabA = await loadTab();
    const tabB = await loadTab();

    const [a, b] = await Promise.all([tabA.getAuthorKey(), tabB.getAuthorKey()]);
    expect(a).toMatch(KEY);
    expect(b).toBe(a);
    expect(localStorage.getItem('yui-chat:author-key')).toBe(a);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('別のタブが保存した鍵に追随する', async () => {
    const tab = await loadTab();
    await tab.getAuthorKey();
    const other = 'B'.repeat(43);
    localStorage.setItem('yui-chat:author-key', other);
    expect(await tab.getAuthorKey()).toBe(other);
  });

  it('localStorage が使えなくても、ページを開いている間は同じ鍵を使う', async () => {
    const tab = await loadTab();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const key = await tab.getAuthorKey();
    expect(key).toMatch(KEY);
    expect(await tab.getAuthorKey()).toBe(key);
  });
});
