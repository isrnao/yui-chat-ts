import { Platform } from 'react-native';

export type PushPreferences = {
  enabled: boolean;
  lastUpdated: number;
};

const DEFAULT_PREFERENCES: PushPreferences = {
  enabled: false,
  lastUpdated: Date.now(),
};

export function shouldEnablePushNotifications(): boolean {
  return Platform.OS !== 'android' ? false : false;
}

export async function registerPushNotifications(): Promise<PushPreferences> {
  // Placeholder: integrate FCM/APNs as follow-up if the product requires push notifications.
  return DEFAULT_PREFERENCES;
}
