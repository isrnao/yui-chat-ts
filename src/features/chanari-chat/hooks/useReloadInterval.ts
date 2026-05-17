import { useEffect, useRef } from 'react';

/**
 * リロード秒数 select に連動して onTick を定期実行するフック。
 * enabled === true の間だけ setInterval を 1 つ張り、
 * seconds / enabled の変化や unmount 時に必ず clearInterval する。
 * 同時に複数 timer を保持しない。
 */
export function useReloadInterval(seconds: number, onTick: () => void, enabled: boolean): void {
  const onTickRef = useRef(onTick);

  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  useEffect(() => {
    if (!enabled) return;

    const id = setInterval(() => {
      onTickRef.current();
    }, seconds * 1000);

    return () => {
      clearInterval(id);
    };
  }, [seconds, enabled]);
}
