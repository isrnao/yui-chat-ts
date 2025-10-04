import type { Chat } from '../chat/types';

export type ConnectivityListener = (online: boolean) => void;

export interface ConnectivityAdapter {
  isOnline(): boolean;
  subscribe?(listener: ConnectivityListener): () => void;
}

export type MockChatOptions = {
  now?: () => number;
  systemName?: string;
  greeterName?: string;
};

const DEFAULT_SYSTEM_NAME = 'システム';
const DEFAULT_GREETER_NAME = 'ゆい';

export function createMockChatData(options: MockChatOptions = {}): Chat[] {
  const {
    now = () => Date.now(),
    systemName = DEFAULT_SYSTEM_NAME,
    greeterName = DEFAULT_GREETER_NAME,
  } = options;

  const current = now();

  return [
    {
      uuid: 'mock-1',
      name: systemName,
      color: '#2563eb',
      message: 'チャットシステムに接続中です...',
      time: current,
      client_time: current,
      optimistic: false,
      system: true,
      email: '',
      ip: '',
      ua: '',
    },
    {
      uuid: 'mock-2',
      name: greeterName,
      color: '#ec4899',
      message: 'こんにちは！チャットへようこそ✨',
      time: current - 60_000,
      client_time: current - 60_000,
      optimistic: false,
      system: false,
      email: '',
      ip: '',
      ua: '',
    },
    {
      uuid: 'mock-3',
      name: 'たろう',
      color: '#059669',
      message: 'よろしくお願いします！',
      time: current - 120_000,
      client_time: current - 120_000,
      optimistic: false,
      system: false,
      email: '',
      ip: '',
      ua: '',
    },
  ];
}

export const defaultMockChatData = createMockChatData();

export function createStaticConnectivityAdapter(online: boolean): ConnectivityAdapter {
  return {
    isOnline: () => online,
  };
}

export function createNavigatorConnectivityAdapter(
  target: Pick<Window, 'navigator' | 'addEventListener' | 'removeEventListener'> | undefined =
    typeof window !== 'undefined' ? window : undefined,
): ConnectivityAdapter {
  const listeners = new Set<ConnectivityListener>();

  const notify = () => {
    const online = target?.navigator?.onLine ?? true;
    listeners.forEach((listener) => listener(online));
  };

  const subscribe = (listener: ConnectivityListener) => {
    listeners.add(listener);

    if (target?.addEventListener && target?.removeEventListener) {
      const onlineHandler = () => listener(true);
      const offlineHandler = () => listener(false);

      target.addEventListener('online', onlineHandler);
      target.addEventListener('offline', offlineHandler);

      return () => {
        listeners.delete(listener);
        target.removeEventListener('online', onlineHandler);
        target.removeEventListener('offline', offlineHandler);
      };
    }

    return () => {
      listeners.delete(listener);
    };
  };

  return {
    isOnline: () => target?.navigator?.onLine ?? true,
    subscribe,
  };
}

export function withConnectivityFallback(
  connectivity: ConnectivityAdapter | undefined,
  fallback: () => Chat[],
  onOffline?: (chats: Chat[]) => void,
): { isOnline(): boolean; resolve(): Chat[] } {
  const adapter = connectivity ?? createStaticConnectivityAdapter(true);

  return {
    isOnline: () => adapter.isOnline(),
    resolve: () => {
      if (!adapter.isOnline()) {
        const chats = fallback();
        onOffline?.(chats);
        return chats;
      }
      return [];
    },
  };
}
