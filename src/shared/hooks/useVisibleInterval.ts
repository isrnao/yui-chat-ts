import { useEffect, useEffectEvent } from 'react';

/**
 * タブが見えている間だけ seconds 秒ごとに onTick を呼ぶ。
 *
 * - seconds が 0 以下か enabled が false なら何もしない
 * - タブが隠れている間はタイマーを止め、表示に戻ったらすぐに 1 回呼んでから間隔を数え直す
 * - onTick は Effect Event として読むので、呼び出し側の関数が変わってもタイマーは張り直さない
 */
export function useVisibleInterval(seconds: number, onTick: () => void, enabled: boolean): void {
  const tick = useEffectEvent(() => onTick());

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
      if (document.visibilityState === 'hidden') {
        stop();
      } else {
        tick();
        stop();
        start();
      }
    };
    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [seconds, enabled]);
}
