import Config from 'react-native-config';
import { createSupabaseClient, hasSupabaseEnv, type SupabaseEnvironment } from '@yui/shared/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const env: Partial<SupabaseEnvironment> = {
    url: Config.SUPABASE_URL,
    anonKey: Config.SUPABASE_ANON_KEY,
  };

  if (!hasSupabaseEnv(env)) {
    throw new Error('Supabase credentials are missing. Configure SUPABASE_URL and SUPABASE_ANON_KEY.');
  }

  cachedClient = createSupabaseClient(env, {
    headers: {
      'X-Client-Name': 'yui-chat-mobile',
    },
  });

  return cachedClient;
}
