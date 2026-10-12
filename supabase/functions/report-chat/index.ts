// Edge Function: report-chat（.kiro/specs/android-native-app design.md §7.6、Task 0.6）
//
// 発言の通報を受けて chat_reports に保存する。Web と Android 版が呼ぶ。保存は service_role で SQL 関数
// insert_chat_report を呼ぶ（表は RLS が有効でポリシーが無く、anon からは読めない）。処理本体は handler.ts。
//
// 設定: config.toml で verify_jwt = false（匿名のため）。NEW_RELIC_LICENSE_KEY があれば New Relic に送る。

import { createClient } from '@supabase/supabase-js';
import { createHandler } from './handler.ts';
import { detectEnvironment, Tracer } from '../save-chat/telemetry.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const environment = detectEnvironment(Deno.env.get('SUPABASE_URL'));

Deno.serve(
  createHandler({
    tracer: new Tracer({
      serviceName: 'report-chat',
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
  })
);
