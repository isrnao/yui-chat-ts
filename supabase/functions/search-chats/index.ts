import postgres from 'postgres';
import { CHAT_ROOM_IDS } from '../_shared/chatRoomIds.ts';
import {
  SearchError,
  parseInput,
  hmac,
  readCursor,
  signCursor,
  toItem,
  DAY,
  type SearchRow,
} from './protocol.ts';
import { buildSearchQuery, CONTEXT_QUERY } from './queries.ts';
import { checkRateLimit } from './rateLimit.ts';

const env = (name: string) => Deno.env.get(name) ?? '';
const secret = env('SEARCH_SIGNING_SECRET');
const enabledRooms = new Set(
  env('SEARCH_ROOM_IDS')
    .split(',')
    .filter((id) => (CHAT_ROOM_IDS as readonly string[]).includes(id))
);
const origins = new Set(env('SEARCH_ALLOWED_ORIGINS').split(',').filter(Boolean));
// No connection or credentials are required while the feature is disabled.
const sql = env('SEARCH_DATABASE_URL')
  ? postgres(env('SEARCH_DATABASE_URL'), {
      max: 1,
      prepare: false,
      ssl: 'require',
      connect_timeout: 3,
      idle_timeout: 20,
    })
  : null;

let queryInFlight = false;

// Bound the stream, not only Content-Length (which clients can omit or forge).
async function readBody(req: Request) {
  if (!req.body) throw new SearchError(400, '検索条件を確認してください。');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) {
        await reader.cancel();
        throw new SearchError(400, '検索条件が長すぎます。');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new SearchError(400, '検索条件を確認してください。');
  }
}
Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (origins.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.has(origin)) return json({ error: '利用できないリクエストです。' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json({ error: 'POSTを使用してください。' }, 405);
  try {
    if (
      env('SEARCH_ENABLED') !== 'true' ||
      !sql ||
      secret.length < 32 ||
      !env('SEARCH_REDIS_URL') ||
      !env('SEARCH_REDIS_TOKEN')
    ) {
      throw new SearchError(503, '検索を一時停止しています。');
    }
    // This header MUST be overwritten by the trusted deployment gateway. No client-ID fallback.
    const ipHeader = env('SEARCH_CLIENT_IP_HEADER');
    const ip = ipHeader ? req.headers.get(ipHeader) : null;
    if (!ip || ip.length > 256) throw new SearchError(503, '検索を一時停止しています。');
    const clientKey = await hmac(`rate:${new Date().toISOString().slice(0, 10)}:${ip}`, secret);
    await checkRateLimit(env('SEARCH_REDIS_URL'), env('SEARCH_REDIS_TOKEN'), clientKey);
    const input = parseInput(await readBody(req), enabledRooms);
    const now = Date.now();
    const cursor =
      input.mode === 'search' && input.cursor
        ? await readCursor(input.cursor, input, secret, now)
        : null;
    if (queryInFlight) throw new SearchError(429, '少し待ってから検索してください。');
    queryInFlight = true;
    try {
      const result = await sql.begin(async (tx) => {
        await tx`SET TRANSACTION READ ONLY`;
        await tx`SET LOCAL statement_timeout = '1s'`;
        // Fail closed if the connection was accidentally configured with postgres/service_role.
        const [role] =
          await tx`SELECT current_user AS name, rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`;
        if (role?.name !== 'chat_search_reader' || role.rolbypassrls || role.rolsuper)
          throw new SearchError(503, '検索を一時停止しています。');
        // Activation requires the hardening operation and a valid index, even if an env flag is set early.
        const [ready] = await tx`SELECT
        EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.chats'::regclass
          AND polname = 'public_active_only' AND NOT polpermissive) AS hardened,
        EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('public.idx_chats_message_pgroonga_active') AND indisvalid AND indisready) AS indexed`;
        if (!ready.hardened || !ready.indexed)
          throw new SearchError(503, '検索を一時停止しています。');
        const [extension] =
          await tx`SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgroonga'`;
        if (!extension) throw new SearchError(503, '検索を一時停止しています。');
        // Load the extension's GUC and keep its RLS support enabled on supported versions.
        await tx`SET LOCAL pgroonga.enable_row_level_security = on`;
        if (input.mode === 'context') {
          const rows = await tx.unsafe<SearchRow[]>(CONTEXT_QUERY, [
            input.roomId,
            input.targetUuid,
            now - 90 * DAY,
            now,
          ]);
          if (!rows.some((row) => row.uuid === input.targetUuid.toLowerCase()))
            throw new SearchError(404, '発言が見つかりません。');
          return { items: rows.map(toItem), nextCursor: null };
        }
        const from = cursor?.from ?? now - input.rangeDays * DAY;
        const to = cursor?.to ?? now;
        const params: (string | number)[] = [input.roomId, from, to, ...input.terms];
        if (cursor) params.push(cursor.last);
        params.push(input.limit + 1);
        const rows = await tx.unsafe<SearchRow[]>(
          buildSearchQuery(extension.nspname, input.terms.length, !!cursor),
          params
        );
        const items = rows.slice(0, input.limit).map(toItem);
        const nextCursor =
          rows.length > input.limit
            ? await signCursor(
                {
                  v: 1,
                  roomId: input.roomId,
                  digest: await hmac(JSON.stringify(input.terms), secret),
                  from,
                  to,
                  rangeDays: input.rangeDays,
                  last: items[items.length - 1].uuid,
                  expires: cursor?.expires ?? now + 15 * 60_000,
                },
                secret
              )
            : null;
        return { items, nextCursor };
      });
      return json(result);
    } finally {
      queryInFlight = false;
    }
  } catch (error) {
    const known = error instanceof SearchError;
    const status = known ? error.status : 503;
    if (status === 429) headers['Retry-After'] = '2';
    // Never log raw SQL errors: drivers can include bound search text.
    return json({ error: known ? error.message : '検索を一時停止しています。' }, status);
  }
});
