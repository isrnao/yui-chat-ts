import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  FILTER_TRANSITION_ATTR,
  ROW_UUID_ATTR,
  nameRowsInView,
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

describe('nameRowsInView', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  /** 行（高さ 20px）と区切り線を top の位置に並べる。jsdom はレイアウトを持たないので矩形を差し替える */
  function mountRows(tops: number[]) {
    const container = document.createElement('div');
    const rows = tops.map((top, i) => {
      const row = document.createElement('div');
      row.setAttribute(ROW_UUID_ATTR, `0190a000-0000-7000-8000-00000000000${i}`);
      row.getBoundingClientRect = () => ({ top, bottom: top + 20 }) as DOMRect;
      const divider = document.createElement('hr');
      container.append(row, divider);
      return { row, divider };
    });
    document.body.append(container);
    return { container, rows };
  }

  it('見えている行とその下 1 画面ぶんの行・区切り線にだけ一意の名前を付け、返した関数で外す', () => {
    const height = window.innerHeight;
    const { container, rows } = mountRows([-100, 10, height + 10, height * 2 + 10]);

    const unname = nameRowsInView(container);

    expect(rows[0]!.row.style.viewTransitionName).toBe('');
    expect(rows[1]!.row.style.viewTransitionName).toBe(
      'filter-row-0190a000-0000-7000-8000-000000000001'
    );
    expect(rows[1]!.divider.style.viewTransitionName).toBe(
      'filter-hr-0190a000-0000-7000-8000-000000000001'
    );
    expect(rows[2]!.row.style.viewTransitionName).toContain('filter-row-');
    // 2 画面より下は付けない（そこで打ち切る）
    expect(rows[3]!.row.style.viewTransitionName).toBe('');

    unname();
    expect(rows[1]!.row.style.viewTransitionName).toBe('');
    expect(rows[1]!.divider.style.viewTransitionName).toBe('');
  });

  it('uuid の CSS の識別子に使えない文字は _ にする', () => {
    const { container, rows } = mountRows([0]);
    rows[0]!.row.setAttribute(ROW_UUID_ATTR, 'optimistic:1.2');
    nameRowsInView(container);
    expect(rows[0]!.row.style.viewTransitionName).toBe('filter-row-optimistic_1_2');
  });

  it('外枠がなければ何もしない', () => {
    expect(() => nameRowsInView(null)()).not.toThrow();
  });
});

describe('runFilterTransition の prepare', () => {
  afterEach(() => {
    delete (document as { startViewTransition?: unknown }).startViewTransition;
    document.documentElement.removeAttribute(FILTER_TRANSITION_ATTR);
  });

  it('古い状態を撮る前に prepare を呼び、終わったら返した関数を呼ぶ。非対応なら呼ばない', async () => {
    const order: string[] = [];
    const unprepare = vi.fn(() => order.push('unprepare'));
    const prepare = vi.fn(() => {
      order.push('prepare');
      return unprepare;
    });

    runFilterTransition(() => order.push('update'), prepare);
    expect(prepare).not.toHaveBeenCalled();

    let finish = () => {};
    Object.assign(document, {
      startViewTransition: vi.fn((callback: () => void) => {
        order.push('capture');
        callback();
        return {
          ready: Promise.resolve(),
          finished: new Promise<void>((resolve) => {
            finish = resolve;
          }),
        };
      }),
    });
    order.length = 0;
    runFilterTransition(() => order.push('update'), prepare);
    finish();
    await vi.waitFor(() => expect(unprepare).toHaveBeenCalledTimes(1));
    expect(order).toEqual(['prepare', 'capture', 'update', 'unprepare']);
  });
});
