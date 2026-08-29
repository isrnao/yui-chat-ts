// Edge Function: save-chat
//
// チャット発言の INSERT を一手に担うサーバー側エンドポイント。
// 目的は ip / ua を「クライアント自己申告」ではなく「サーバー観測値」で確定し、
// 詐称不可能な証跡として記録すること。クライアントは ip / ua を送らない。
//
// - ip: x-forwarded-for（先頭ホップ）→ x-real-ip の順でリクエストヘッダから取得。
// - ip_masked: 上記 ip を伏せた表示用の値。生 ip は anon から読めない（列レベル GRANT）
//   ため、クライアントの発言末尾表示はこちらを参照する。
// - ua: user-agent ヘッダから取得。
// - 永続化は service_role で行い RLS をバイパスする（anon の直 INSERT は別途封鎖）。
// - uuid / time / deleted は DB 既定値に委ねる。metadata はクライアント値をそのまま保存
//   （optimisticNonce の echo を維持し、クライアントの楽観的更新突合を壊さないため）。
//
// デプロイ: supabase functions deploy save-chat
// 設定: config.toml で verify_jwt = false（匿名チャットのため）

// バージョンは deno.json の import map に集約する（直 URL 重複を避ける）
import { createClient } from '@supabase/supabase-js';

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

// IPv6 の上位 48bit（先頭3ブロック）だけを残す。
// 圧縮表記を展開してから切り出す点が要。単純に split(':') で先頭3要素を取ると、
// "2001::dead:beef" が "2001::dead:*" となり、実際には7ブロック目にあたるホスト側の
// "dead" が露出してしまう（正しくは 2001:0:0:*）。
function maskIpv6(ip: string): string {
  const lower = ip.toLowerCase();
  // 16進とコロンのみ / "::" は最大1回。IPv4 射影形式などはここで弾いて全伏せにする。
  if (!/^[0-9a-f:]+$/.test(lower) || (lower.match(/::/g) ?? []).length > 1) return '*';

  const [head, tail] = lower.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];

  const hasCompression = lower.includes('::');
  // "::" は 1 ブロック以上のゼロを置換する表記なので、明示ブロックが 8 個ある
  // "1:2:3:4:5:6:7:8::" のような値は不正。inet も同じ理由で拒否する。
  if (hasCompression && headParts.length + tailParts.length >= 8) return '*';

  const parts = hasCompression
    ? [
        ...headParts,
        ...Array(8 - headParts.length - tailParts.length).fill('0'),
        ...tailParts,
      ]
    : headParts;

  // 展開後はちょうど8ブロックになるはず。過不足がある値は不正とみなして全伏せにする
  // （マイグレーション側の inet キャストも同じ値を弾くため、両者の出力が常に一致する）
  if (parts.length !== 8 || parts.some((p) => p === '' || p.length > 4)) return '*';
  // 先行ゼロを落として正規化する（マイグレーションの to_hex 出力と揃えるため）
  return `${parts.slice(0, 3).map((p) => p.replace(/^0+(?=.)/, '')).join(':')}:*`;
}

// 表示用に IP の末尾を伏せる。
// クライアント側で再マスクはしない（生 ip がそもそもクライアントに渡らない）ため、
// ここが唯一のマスク実装。マイグレーションのバックフィル式と規則を揃えること。
function maskIp(ip: string): string {
  if (!ip) return '';
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return ip.replace(/\.\d{1,3}$/, '.*');
  if (ip.includes(':')) return maskIpv6(ip);
  // 想定外の形式は全体を伏せる
  return '*';
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
  const clientIp = resolveClientIp(req);
  const row = {
    room_id: body.room_id,
    name: body.name,
    color: typeof body.color === 'string' ? body.color : '',
    message: body.message,
    system: typeof body.system === 'boolean' ? body.system : false,
    email: typeof body.email === 'string' ? body.email : null,
    metadata: body.metadata ?? null,
    ip: clientIp,
    ip_masked: maskIp(clientIp),
    ua: req.headers.get('user-agent') ?? '',
  };

  const { data, error } = await supabase
    .from('chats')
    .insert(row)
    // ip_masked / ua も返す。クライアントは楽観行をこの応答でマージするため、
    // これらを返さないと realtime INSERT との到着順によって表示が空に戻る。
    .select('uuid,room_id,time,ip_masked,ua')
    .single();

  if (error) {
    return json({ error: `Failed to save chat: ${error.message}` }, 500, cors);
  }

  return json(data, 200, cors);
});
