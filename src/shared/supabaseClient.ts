import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// 環境変数の確認
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase environment variables are missing');
  if (import.meta.env.DEV) {
    console.log('VITE_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
    console.log('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ Set' : '❌ Missing');
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  db: {
    schema: 'public',
  },
  global: {
    // 認証ヘッダーを確実に設定する。
    // 以前は Accept-Encoding（ブラウザが設定を許さないヘッダなので無視される）、使っていない
    // X-My-Custom-Header、Content-Type（PostgREST / Functions のクライアントがリクエストごとに付ける）
    // も全リクエストに付けていたが、どれも効果がないので外した。
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
