// Edge Function: two-shot（ツーショットチャット）
//
// 入室・発言・更新・退室・相手を退室・閉鎖・画面クリアを 1 つのエンドポイントで受ける。
// 状態遷移の規則は rules.ts、要求の検証と保存は handler.ts。ここでは依存を組み立てて Deno.serve に渡すだけにする。
// spec: .kiro/specs/two-shot-chat/design.md §7
//
// - 認可は anon key ではなく、本機能のトークン（x-two-shot-token）と席で行う（config.toml で verify_jwt = false）
// - 保存は service_role で two_shot_commit を呼ぶ（anon は two_shot_* の表と保存の関数を使えない）
// - 重複入室の判定に使う IP は TWO_SHOT_TRUSTED_IP_HEADER で信頼境界を設定したときだけ使う（handler.ts の
//   createIpResolver）。未設定なら判定しない
// - トレース: NEW_RELIC_LICENSE_KEY があれば New Relic へ送る（save-chat と同じ telemetry.ts）
//
// デプロイ: bash scripts/smoke-two-shot-edge.sh（Edge Runtime での起動確認）→ supabase functions deploy two-shot

import { createClient } from '@supabase/supabase-js';
import {
  createHandler,
  createIpResolver,
  createSupabaseStore,
  type SupabaseLike,
} from './handler.ts';
import { detectEnvironment, Tracer } from '../save-chat/telemetry.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const environment = detectEnvironment(supabaseUrl);
const tracer = new Tracer({
  serviceName: 'two-shot',
  environment,
  licenseKey: Deno.env.get('NEW_RELIC_LICENSE_KEY'),
});
const client =
  supabaseUrl && serviceRoleKey
    ? (createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      }) as unknown as SupabaseLike)
    : null;

Deno.serve(
  createHandler({
    tracer,
    store: (server) => (client === null ? null : createSupabaseStore(client, tracer, server)),
    now: () => Date.now(),
    randomUUID: () => crypto.randomUUID(),
    resolveIp: createIpResolver(Deno.env.get('TWO_SHOT_TRUSTED_IP_HEADER')),
    waitUntil:
      typeof EdgeRuntime !== 'undefined' ? (task) => EdgeRuntime.waitUntil(task) : undefined,
  })
);
