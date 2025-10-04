import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CacheItem, ChatCacheStorage } from '@yui/shared/api/chat';

const STORAGE_KEY = '@yui/chat/cache';

export function createAsyncStorageChatCache(): ChatCacheStorage {
  return {
    async read() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw) as CacheItem;
        return parsed;
      } catch (error) {
        return null;
      }
    },
    async write(cache: CacheItem) {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
      } catch (error) {
        // ignore storage errors
      }
    },
    async clear() {
      try {
        await AsyncStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        // ignore storage errors
      }
    },
  };
}
