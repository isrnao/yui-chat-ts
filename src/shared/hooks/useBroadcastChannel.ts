import { useRef, useEffect } from 'react';

// ジェネリクスで型安全
export function useBroadcastChannel(name: string, onMsg: () => void) {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const ch = new BroadcastChannel(name);
    channelRef.current = ch;
    ch.onmessage = (e) => onMsg(e.data);
    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, [name, onMsg]);

  return channelRef;
}
