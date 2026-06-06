// Edge Function: save-chat
//
// チャット発言の INSERT を一手に担うサーバー側エンドポイント。
// 目的は ip / ua を「クライアント自己申告」ではなく「サーバー観測値」で確定し、
// 詐称不可能な証跡として記録すること。クライアントは ip / ua を送らない。
//
// - ip: x-forwarded-for（先頭ホップ）→ x-real-ip の順でリクエストヘッダから取得。
// - ua: user-agent ヘッダから取得。
// - 永続化は service_role で行い RLS をバイパスする（anon の直 INSERT は別途封鎖）。
// - uuid / time / deleted は DB 既定値に委ねる。metadata はクライアント値をそのまま保存
//   （optimisticNonce の echo を維持し、クライアントの楽観的更新突合を壊さないため）。
//
// デプロイ: supabase functions deploy save-chat
// 設定: config.toml で verify_jwt = false（匿名チャットのため）

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// プリフライトが要求したヘッダ（Access-Control-Request-Headers）をそのまま許可に
// 反映する。クライアント（supabaseClient.ts）が apikey / authorization に加えて
// x-my-custom-header 等のグローバルヘッダを付けても弾かれないようにするため。
function buildCorsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      req.headers.get('access-control-request-headers') ??
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// x-forwarded-for は "client, proxy1, proxy2" 形式。先頭が実クライアント。
function resolveClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || '';
}

// クライアントが詐称・上書きできないよう、永続化するフィールドを限定する。
// uuid / time / deleted / ip / ua はここで受け付けない。
interface SaveChatBody {
  room_id?: unknown;
  name?: unknown;
  color?: unknown;
  message?: unknown;
  system?: unknown;
  email?: unknown;
  metadata?: unknown;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, cors);
  }

  let body: SaveChatBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, cors);
  }

  // 最低限のバリデーション（name / message / room_id 必須）。
  if (!isNonEmptyString(body.room_id)) {
    return json({ error: 'room_id is required' }, 400, cors);
  }
  if (!isNonEmptyString(body.name)) {
    return json({ error: 'name is required' }, 400, cors);
  }
  if (typeof body.message !== 'string' || body.message.trim().length === 0) {
    return json({ error: 'message is required' }, 400, cors);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server misconfigured' }, 500, cors);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ip / ua はサーバー観測値で確定（クライアント値は一切信用しない）。
  const row = {
    room_id: body.room_id,
    name: body.name,
    color: typeof body.color === 'string' ? body.color : '',
    message: body.message,
    system: typeof body.system === 'boolean' ? body.system : false,
    email: typeof body.email === 'string' ? body.email : null,
    metadata: body.metadata ?? null,
    ip: resolveClientIp(req),
    ua: req.headers.get('user-agent') ?? '',
  };

  const { data, error } = await supabase
    .from('chats')
    .insert(row)
    .select('uuid,room_id,time')
    .single();

  if (error) {
    return json({ error: `Failed to save chat: ${error.message}` }, 500, cors);
  }

  return json(data, 200, cors);
});
