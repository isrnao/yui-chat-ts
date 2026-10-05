import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  COLLAPSE_MS,
  FILTER_TRANSITION_ATTR,
  collapseRowThen,
  runFilterTransition,
} from './filterTransition';

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

describe('collapseRowThen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  /** 行と、そのすぐ下の区切り線を置く */
  function mountRow() {
    const row = document.createElement('div');
    const divider = document.createElement('hr');
    document.body.append(row, divider);
    return { row, divider };
  }

  /** Web Animations を差し替え、finish() で縮み終わったことにする */
  function stubAnimate() {
    let finish = () => {};
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const animate = vi.fn(() => ({ finished }));
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
    return { animate, finish };
  }

  afterEach(() => {
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });

  it('Web Animations がなければ、その場で done を呼ぶ', () => {
    const { row } = mountRow();
    const done = vi.fn();
    collapseRowThen(row, done);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('行と区切り線を高さ 0 まで縮め、縮み終わってから done を呼ぶ', async () => {
    const { row, divider } = mountRow();
    const { animate, finish } = stubAnimate();
    const done = vi.fn();

    collapseRowThen(row, done);

    expect(animate).toHaveBeenCalledTimes(2);
    const [keyframes, options] = animate.mock.calls[0] as unknown as [
      Record<string, string>[],
      Record<string, unknown>,
    ];
    expect(keyframes[keyframes.length - 1]).toMatchObject({
      height: '0px',
      marginBottom: '0px',
      opacity: '0',
    });
    expect(options).toMatchObject({ duration: COLLAPSE_MS, fill: 'forwards' });
    expect(animate.mock.contexts).toEqual([row, divider]);
    expect(row.style.overflow).toBe('hidden');
    expect(done).not.toHaveBeenCalled();

    finish();
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  });

  it('動きを減らす設定では縮めずに done を呼ぶ', () => {
    const { row } = mountRow();
    const { animate } = stubAnimate();
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    const done = vi.fn();
    collapseRowThen(row, done);
    expect(animate).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('行がないときは、その場で done を呼ぶ', () => {
    const done = vi.fn();
    collapseRowThen(null, done);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
