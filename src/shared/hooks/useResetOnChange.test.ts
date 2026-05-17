import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useResetOnChange } from './useResetOnChange';

describe('useResetOnChange', () => {
  it('値が変わったときだけ onChange が呼ばれる', () => {
    const onChange = vi.fn();
    const { rerender } = renderHook(({ value }) => useResetOnChange(value, onChange), {
      initialProps: { value: 'a' },
    });

    // 初回 render: 前回値 = 初回値なので変化なし → onChange は呼ばれない
    expect(onChange).not.toHaveBeenCalled();

    // 同じ値で再 render: 変化なし → 呼ばれない
    rerender({ value: 'a' });
    expect(onChange).not.toHaveBeenCalled();

    // 値変化: 呼ばれる (next, prev の順で受け取る)
    rerender({ value: 'b' });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('b', 'a');

    // さらに変化: 累計 2 回
    rerender({ value: 'c' });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith('c', 'b');
  });

  it('Object.is で同値判定する (NaN 同士は同値、+0/-0 は別)', () => {
    const onChange = vi.fn();
    const { rerender } = renderHook(({ value }) => useResetOnChange(value, onChange), {
      initialProps: { value: NaN as number },
    });

    // NaN → NaN は Object.is で true なので呼ばれない
    rerender({ value: NaN });
    expect(onChange).not.toHaveBeenCalled();

    // +0 → -0 は Object.is で false なので呼ばれる
    const onChangeZero = vi.fn();
    const { rerender: rerenderZero } = renderHook(
      ({ value }) => useResetOnChange(value, onChangeZero),
      { initialProps: { value: 0 } }
    );
    rerenderZero({ value: -0 });
    expect(onChangeZero).toHaveBeenCalledExactlyOnceWith(-0, 0);
  });
});
