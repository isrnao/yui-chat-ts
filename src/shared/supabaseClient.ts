import { PostgrestClient } from '@supabase/postgrest-js';
import { RealtimeClient, type RealtimeChannel } from '@supabase/realtime-js';
import { FunctionsClient } from '@supabase/functions-js';

/**
 * Supabase のクライアント。このアプリが使う機能（PostgREST・Realtime・Edge Functions）の
 * パッケージだけを直接使う（.kiro/specs/react-2026-refactoring Requirement 13）。
 *
 * `@supabase/supabase-js` の createClient は、使っていない Auth と Storage のクライアントも
 * 必ず読み込むため、チャット系ルートの初期 JS が重くなっていた。匿名チャットでログインは無く、
 * 認証は常に anon key なので、supabase-js が内部でしている初期化（apikey / Authorization
 * ヘッダ、Realtime の apikey パラメータと setAuth）を同じ形で行う。
 *
 * 呼び出し側が使う形（from / channel / removeChannel / functions.invoke）は createClient と同じ。
 */
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

// 環境変数の確認
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase environment variables are missing');
  if (import.meta.env.DEV) {
    console.log('VITE_SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
    console.log('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✅ Set' : '❌ Missing');
  }
}

/** 未設定のときも初期化で落ちないよう、仮の URL で組み立てる（通信は失敗する） */
const baseUrl = new URL(supabaseUrl || 'http://localhost');
const endpoint = (path: string) =>
  new URL(path, baseUrl.href.endsWith('/') ? baseUrl : `${baseUrl.href}/`);

const headers = {
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${supabaseAnonKey}`,
};

const rest = new PostgrestClient(endpoint('rest/v1').href, { headers, schema: 'public' });

const realtimeUrl = endpoint('realtime/v1');
realtimeUrl.protocol = realtimeUrl.protocol.replace('http', 'ws');
const realtime = new RealtimeClient(realtimeUrl.href, {
  headers,
  params: { apikey: supabaseAnonKey, eventsPerSecond: 10 },
  // ログインが無いので、Realtime の認可も常に anon key で行う
  accessToken: async () => supabaseAnonKey,
});
void realtime.setAuth(supabaseAnonKey);

const functions = new FunctionsClient(endpoint('functions/v1').href, { headers });

export const supabase = {
  from: (relation: string) => rest.from(relation),
  channel: (name: string) => realtime.channel(name),
  removeChannel: (channel: RealtimeChannel) => realtime.removeChannel(channel),
  functions,
};

export type { RealtimeChannel };
