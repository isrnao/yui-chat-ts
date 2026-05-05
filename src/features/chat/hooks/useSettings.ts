import { useSyncExternalStore } from 'react';
import * as settingsStore from '@features/chat/utils/settingsStore';

export function useSettings() {
  const settings = useSyncExternalStore(
    settingsStore.subscribe,
    settingsStore.getSnapshot,
    settingsStore.getServerSnapshot
  );
  return {
    settings,
    updateSettings: settingsStore.updateSettings,
  };
}
