import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

/**
 * 「ストア由来の既定値を持つ入力 state」。
 *
 * SSG + hydration では、サーバーは `getServerSnapshot`（= 既定値）で描画し、
 * クライアントも hydration 中は同じ既定値を使う。その後 `useSyncExternalStore` が
 * localStorage 由来の実値へ切り替わる。
 *
 * ここで `useState(() => settings.name)` のように値をコピーすると、初回レンダーの
 * 既定値を握ったまま更新に追随せず、「前回の名前を覚えている」機能が壊れる。
 * ユーザーが編集するまではストアの値をそのまま映し、編集後だけローカル値を優先する。
 *
 * 戻り値の setter は `useState` と同じく更新関数も受け付ける。
 *
 * @param storeValue ストア（`useSettings` など）から得た現在値
 */
export function useStoreBackedState<T>(storeValue: T): [T, Dispatch<SetStateAction<T>>] {
  // 「未編集」を null で表す。T 自体が undefined を取りうる場合と区別するため箱に入れる。
  const [edited, setEdited] = useState<{ value: T } | null>(null);
  const value = edited === null ? storeValue : edited.value;

  const setValue: Dispatch<SetStateAction<T>> = (action) => {
    setEdited((previous) => {
      const current = previous === null ? storeValue : previous.value;
      const next = typeof action === 'function' ? (action as (prev: T) => T)(current) : action;
      return { value: next };
    });
  };

  return [value, setValue];
}
