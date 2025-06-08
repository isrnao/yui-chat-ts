import { useEffect, useRef } from "react";

/**
 * BroadcastChannel を React フック化
 * @param name チャンネル名
 * @param onMessage メッセージ受信時コールバック
 * @param deps 依存配列（onMessageの依存も含めること）
 * @returns BroadcastChannel インスタンス（ref.current）
 */
export function useBroadcastChannel<T = any>(
  name: string,
  onMessage: (data: T, ev: MessageEvent) => void,
  deps: any[] = []
) {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const bc = new BroadcastChannel(name);
    channelRef.current = bc;
    bc.onmessage = (ev) => {
      onMessage(ev.data, ev);
    };
    return () => {
      bc.close();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, ...deps]);

  return channelRef;
}
