import { useRef, useEffect } from 'react';

// ジェネリクスで型安全
export function useBroadcastChannel<T>(name: string, onMsg: (data: T) => void) {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const ch = new BroadcastChannel(name);
    channelRef.current = ch;

    ch.onmessage = (e) => onMsg(e.data as T);
    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, [name, onMsg]);

  return channelRef;
}
