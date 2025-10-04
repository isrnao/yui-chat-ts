import NetInfo from '@react-native-community/netinfo';
import type { ConnectivityAdapter, ConnectivityListener } from '@yui/shared/utils/fallback';

export function createNetInfoConnectivityAdapter(): ConnectivityAdapter {
  let currentOnline = true;
  const listeners = new Set<ConnectivityListener>();
  let unsubscribeNetInfo: (() => void) | null = null;
  let subscriptionCount = 0;

  NetInfo.fetch().then((state) => {
    currentOnline = state.isConnected === true && state.isInternetReachable !== false;
  });

  const notify = (online: boolean) => {
    listeners.forEach((listener) => listener(online));
  };

  const ensureNetInfoSubscription = () => {
    if (unsubscribeNetInfo) {
      return;
    }
    unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const nextOnline = state.isConnected === true && state.isInternetReachable !== false;
      if (nextOnline !== currentOnline) {
        currentOnline = nextOnline;
        notify(currentOnline);
      }
    });
  };

  const releaseNetInfoSubscription = () => {
    if (subscriptionCount === 0 && unsubscribeNetInfo) {
      unsubscribeNetInfo();
      unsubscribeNetInfo = null;
    }
  };

  return {
    isOnline: () => currentOnline,
    subscribe: (listener: ConnectivityListener) => {
      subscriptionCount += 1;
      listeners.add(listener);
      ensureNetInfoSubscription();
      listener(currentOnline);

      return () => {
        listeners.delete(listener);
        subscriptionCount = Math.max(0, subscriptionCount - 1);
        releaseNetInfoSubscription();
      };
    },
  };
}
