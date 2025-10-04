import { createClient, type SupabaseClient, type SupabaseClientOptions } from '@supabase/supabase-js';

export type SupabaseEnvironment = {
  url: string;
  anonKey: string;
};

export type SupabaseClientFactoryOptions<T extends string = 'public'> = {
  /** 上書きしたい Supabase クライアントオプション */
  options?: SupabaseClientOptions<T>;
  /** 追加で付与したい共通 HTTP ヘッダー */
  headers?: Record<string, string>;
};

const DEFAULT_HEADERS = {
  'X-Client-Name': 'yui-chat',
  'Accept-Encoding': 'gzip, deflate, br',
  'Content-Type': 'application/json',
} as const;

export function createSupabaseClient<T extends string = 'public'>(
  env: SupabaseEnvironment,
  { options, headers }: SupabaseClientFactoryOptions<T> = {},
): SupabaseClient<T> {
  if (!env.url || !env.anonKey) {
    throw new Error('Supabase credentials are missing. Provide both url and anonKey.');
  }

  const mergedOptions: SupabaseClientOptions<T> = {
    ...options,
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
      ...options?.auth,
    },
    db: {
      schema: 'public',
      ...options?.db,
    },
    global: {
      ...options?.global,
      headers: {
        apikey: env.anonKey,
        Authorization: `Bearer ${env.anonKey}`,
        ...DEFAULT_HEADERS,
        ...(options?.global?.headers ?? {}),
        ...(headers ?? {}),
      },
    },
    realtime: {
      ...options?.realtime,
      params: {
        eventsPerSecond: 10,
        ...(options?.realtime?.params ?? {}),
      },
    },
  };

  return createClient(env.url, env.anonKey, mergedOptions);
}

export function hasSupabaseEnv(env: Partial<SupabaseEnvironment>): env is SupabaseEnvironment {
  return Boolean(env.url) && Boolean(env.anonKey);
}
