import { describe, it, expect, vi, afterEach } from 'vitest';
import { FILTER_TRANSITION_ATTR, runFilterTransition } from './filterTransition';

type Doc = { startViewTransition?: unknown };

function stubViewTransition({ skip = false } = {}) {
  let resolveFinished = () => {};
  const startViewTransition = vi.fn((callback: () => void) => {
    // ブラウザは古い状態を撮ってからコールバックを呼ぶ。ここでは同期で呼ぶ
    callback();
    return {
      ready: skip ? Promise.reject(new DOMException('skipped', 'AbortError')) : Promise.resolve(),
      finished: new Promise<void>((resolve) => {
        resolveFinished = resolve;
      }),
      updateCallbackDone: Promise.resolve(),
    };
  });
  Object.assign(document, { startViewTransition });
  return { startViewTransition, finish: () => resolveFinished() };
}

describe('runFilterTransition', () => {
  afterEach(() => {
    delete (document as Doc).startViewTransition;
    document.documentElement.removeAttribute(FILTER_TRANSITION_ATTR);
    vi.unstubAllGlobals();
  });

  it('View Transitions がないブラウザでは、そのまま更新する', () => {
    const update = vi.fn();
    runFilterTransition(update);
    expect(update).toHaveBeenCalledTimes(1);
    expect(document.documentElement.hasAttribute(FILTER_TRANSITION_ATTR)).toBe(false);
  });

  it('View Transition の中で更新し、終わるまで <html> に属性を付ける', async () => {
    const { startViewTransition, finish } = stubViewTransition();
    const update = vi.fn();
    runFilterTransition(update);
    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(document.documentElement.hasAttribute(FILTER_TRANSITION_ATTR)).toBe(true);

    finish();
    await vi.waitFor(() =>
      expect(document.documentElement.hasAttribute(FILTER_TRANSITION_ATTR)).toBe(false)
    );
  });

  it('動きを減らす設定では View Transition を使わない', () => {
    const { startViewTransition } = stubViewTransition();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    const update = vi.fn();
    runFilterTransition(update);
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('省かれても未処理の reject を出さない', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const { finish } = stubViewTransition({ skip: true });
    runFilterTransition(vi.fn());
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
