import { useState } from 'react';

/**
 * 値の変化を render 中に検知して onChange を呼ぶ React 公式パターン
 * (https://react.dev/reference/eslint-plugin-react-hooks/lints/set-state-in-effect)
 * の薄いラッパー。effect 内 setState で state を巻き戻すと余分な render が走るのを避ける。
 *
 * 比較は Object.is なので、NaN 同士は同値、+0 / -0 は別値として扱われる。
 *
 * @example
 *   useResetOnChange(roomId, () => {
 *     setChatLog([]);
 *     setIsLoading(true);
 *   });
 */
export function useResetOnChange<T>(value: T, onChange: (next: T, prev: T) => void): void {
  const [prev, setPrev] = useState(value);
  if (!Object.is(value, prev)) {
    setPrev(value);
    onChange(value, prev);
  }
}
