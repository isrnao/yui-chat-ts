import { useRef, useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/** SSR と hydration 中は送信不可。各フォームの hydration 後の commit で解禁する。 */
export function useEntrySubmission(isPending: boolean) {
  // 設定ストアも同じ hydration 境界でクライアント値へ切り替わる。
  // 先行入力はフォームの layout effect でこの切替より先に取り込む。
  const ready = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
  const inFlight = useRef(false);

  const submit = async (action: () => void | Promise<void>) => {
    if (!ready || isPending || inFlight.current) return;
    inFlight.current = true;
    try {
      await action();
    } catch {
      // 入室の失敗はフォームを再表示する親が扱う。同期例外も未処理にしない。
    }
    inFlight.current = false;
  };

  return { ready, submit };
}
