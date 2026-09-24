import { useEffect, useEffectEvent } from 'react';

/**
 * タブが見えている間だけ seconds 秒ごとに onTick を呼ぶ（原作の <meta http-equiv="Refresh"> の代わり）。
 * spec: requirements.md Requirement 8.2 / 8.3（D13）
 *
 * - seconds が 0 か enabled が false なら何もしない
 * - タブが非表示の間はタイマーを止め、表示に戻ったらすぐに 1 回呼んでから間隔を数え直す
 * - onTick は Effect Event として読むので、呼び出し側の関数が変わってもタイマーは張り直さない
 *   （ちゃなりの useReloadInterval と同じ）
 */
export function useAutoRefresh(seconds: number, onTick: () => void, enabled: boolean): void {
  const tick = useEffectEvent(() => {
    onTick();
  });

  useEffect(() => {
    if (!enabled || seconds <= 0) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer === null) timer = setInterval(() => tick(), seconds * 1000);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        tick();
        stop();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [seconds, enabled]);
}
