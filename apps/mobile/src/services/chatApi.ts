import { createChatApi, type ChatApi } from '@yui/shared/api/chat';
import { createAsyncStorageChatCache } from '../storage/chatCacheStorage';
import { createNetInfoConnectivityAdapter } from '../utils/connectivity';
import { getSupabaseClient } from './supabase';

let cachedChatApi: ChatApi | null = null;

export function getChatApi(): ChatApi {
  if (cachedChatApi) {
    return cachedChatApi;
  }

  const supabase = getSupabaseClient();
  const connectivity = createNetInfoConnectivityAdapter();
  const cacheStorage = createAsyncStorageChatCache();

  cachedChatApi = createChatApi({
    supabase,
    connectivity,
    cacheStorage,
    retry: {
      attempts: 4,
      delayMs: 800,
    },
  });

  return cachedChatApi;
}
