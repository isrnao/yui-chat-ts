import { useEffect, useEffectEvent } from 'react';

/**
 * リロード秒数 select に連動して onTick を定期実行するフック。
 * enabled === true の間だけ setInterval を 1 つ張り、
 * seconds / enabled の変化や unmount 時に必ず clearInterval する。
 * 同時に複数 timer を保持しない。
 *
 * onTick は Effect Event として読み出すため、コールバックの同一性が変わっても
 * timer は張り直されない。以前は「最新 callback を ref へコピーする Effect」で
 * 同じことをしていたが、React 19.2 の useEffectEvent がその定型を置き換える
 * (https://react.dev/reference/react/useEffectEvent のタイマー例と同型)。
 */
export function useReloadInterval(seconds: number, onTick: () => void, enabled: boolean): void {
  const onInterval = useEffectEvent(() => {
    onTick();
  });

  useEffect(() => {
    if (!enabled) return;

    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id !== null || document.visibilityState === 'hidden') return;
      id = setInterval(() => onInterval(), seconds * 1000);
    };
    const visibility = () => {
      if (document.visibilityState === 'hidden') {
        if (id !== null) clearInterval(id);
        id = null;
      } else {
        onInterval();
        start();
      }
    };
    start();
    document.addEventListener('visibilitychange', visibility);

    return () => {
      if (id !== null) clearInterval(id);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [seconds, enabled]);
}
