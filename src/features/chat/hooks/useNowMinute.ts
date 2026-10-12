import { useEffect, useState } from 'react';
import { usePageReturn } from '@shared/hooks/usePageReturn';

const MINUTE_MS = 60_000;

/**
 * 1 分境界で再評価される現在時刻を返す。
 * 次の分境界まで setTimeout で待ち、その後 60_000ms 間隔で更新する。
 */
export function useNowMinute(): number {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const start = Date.now();
    const msUntilNextMinute = MINUTE_MS - (start % MINUTE_MS);

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const timeoutId = setTimeout(() => {
      setNow(Date.now());
      intervalId = setInterval(() => {
        setNow(Date.now());
      }, MINUTE_MS);
    }, msUntilNextMinute);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    };
  }, []);
  // 隠れている間はタイマーが遅れるので、戻ったときに今の時刻へ合わせる
  usePageReturn(() => setNow(Date.now()));

  return now;
}
