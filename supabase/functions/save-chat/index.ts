// Edge Function: save-chat
//
// チャット発言の INSERT を一手に担うサーバー側エンドポイント。
// 目的は ip / ua を「クライアント自己申告」ではなく「サーバー観測値」で確定し、
// 詐称不可能な証跡として記録すること。クライアントは ip / ua を送らない。
//
// - ip: x-forwarded-for（先頭ホップ）→ x-real-ip の順でリクエストヘッダから取得。
// - ip_masked: ip から Postgres が自動計算する生成列（migration 20260830020000）。
//   ここでは書き込まない（生成列へ値を渡すとエラーになる）。生 ip は anon から
//   読めないため、クライアントの発言末尾表示はこの列を参照する。
// - ua: user-agent ヘッダから取得。
// - 永続化は service_role で行い RLS をバイパスする（anon の直 INSERT は別途封鎖）。
// - uuid / time / deleted は DB 既定値に委ねる。metadata はクライアント値をそのまま保存
//   （optimisticNonce の echo を維持し、クライアントの楽観的更新突合を壊さないため）。
// - トレース: NEW_RELIC_LICENSE_KEY が設定されていれば New Relic へ送る（telemetry.ts）。
//
// 処理本体は handler.ts。ここでは依存を組み立てて Deno.serve に渡すだけにする。
//
// デプロイ: supabase functions deploy save-chat
// 設定: config.toml で verify_jwt = false（匿名チャットのため）

// バージョンは deno.json の import map に集約する（直 URL 重複を避ける）
import { createClient } from '@supabase/supabase-js';
import { createHandler } from './handler.ts';
import { detectEnvironment, Tracer } from './telemetry.ts';

// Supabase Edge Runtime が提供するグローバル。レスポンス返却後も処理を継続させる。
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const environment = detectEnvironment(Deno.env.get('SUPABASE_URL'));

Deno.serve(
  createHandler({
    tracer: new Tracer({
      serviceName: 'save-chat',
      environment,
      licenseKey: Deno.env.get('NEW_RELIC_LICENSE_KEY'),
    }),
    env: (key) => Deno.env.get(key),
    createSupabase: (url, serviceRoleKey) =>
      createClient(url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      }),
    waitUntil:
      typeof EdgeRuntime !== 'undefined' ? (task) => EdgeRuntime.waitUntil(task) : undefined,
    environment,
  })
);
