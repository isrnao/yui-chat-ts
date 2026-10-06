// save-chat のリクエスト処理本体。index.ts は Deno.serve に渡すだけにして、
// 依存（Supabase クライアント・Tracer・waitUntil）を差し替えてテストできるようにする。
//
// トレースの流れ（spec observability-new-relic R3）:
//   POST save-chat（server） ─┬─ db insert chats
//                              └─ triage（応答後、waitUntil） ─ POST /api/v1/evaluate など
// - サーバースパンは応答を作った直後に終了し、1 回目の flush を登録する。triage が止まっても
//   保存区間のスパンはこれで送られる。
// - triage は期限付きで動かし、成功・失敗・期限切れのどれでも finally で 2 回目の flush を行う。

import type { SupabaseClient } from '@supabase/supabase-js';
import { checkSayInput, sanitizeMetadata, type InputErrorCode } from './schema.ts';
import { shouldTriage, triageAdminChat, type TriageTrace } from './triage.ts';
import {
  parseTraceparent,
  SpanKind,
  type Span,
  type SpanContext,
  type Tracer,
} from './telemetry.ts';

export interface HandlerDeps {
  tracer: Tracer;
  env: (key: string) => string | undefined;
  createSupabase: (url: string, serviceRoleKey: string) => SupabaseClient;
  /** Edge Runtime では EdgeRuntime.waitUntil。未定義ならその場で await する（ローカル実行用） */
  waitUntil?: (promise: Promise<unknown>) => void;
  environment: string;
  /** triage 全体の期限（spec R3.10） */
  triageDeadlineMs?: number;
}

// プリフライトが要求したヘッダ（Access-Control-Request-Headers）をそのまま許可に
// 反映する。クライアント（supabaseClient.ts）が apikey / authorization に加えて
// x-my-custom-header 等のグローバルヘッダを付けても弾かれないようにするため。
// traceparent / tracestate / x-chat-operation-id / x-chat-attempt もこれで許可される。
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

/** 要求の誤り。文言はクライアントが code から選ぶ（`{ "error": { "code": "invalid_name" } }`） */
// 5xx の本文は変えない（.kiro/specs/observability-new-relic design.md の R4.4 は取りやめ）
type ErrorCode = InputErrorCode | 'method_not_allowed' | 'invalid_json';

function reject(code: ErrorCode, status: number, cors: Record<string, string>): Response {
  return json({ error: { code } }, status, cors);
}

/**
 * 入力の規則（schema.ts）の扱い。`enforce` で拒否し、それ以外（既定）は違反を記録するだけで
 * 今までどおり保存する（docs/SERVER_SIDE_LOGIC_REFACTORING.md S1 の「記録だけ」の期間）。
 */
export type InputMode = 'log' | 'enforce';

export function readInputMode(env: (key: string) => string | undefined): InputMode {
  return env('SAVE_CHAT_INPUT_MODE') === 'enforce' ? 'enforce' : 'log';
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

/** 保存した行（triage は部屋の rooms.triage。クライアントには返さない） */
interface SavedRow {
  uuid: string;
  room_id: string;
  time: number;
  ip_masked: string;
  ua: string;
  triage: boolean;
}

interface ChatRow {
  room_id: string;
  name: string;
  color: string;
  message: string;
  system: boolean;
  email: string | null;
  metadata: unknown;
  ip: string;
  ua: string;
  /** 書いた端末の鍵を chat_authors に残すか（利用者の発言だけ true） */
  author: boolean;
}

interface WriteResult {
  data: SavedRow[] | null;
  error: { code?: string; message?: string } | null;
}

/**
 * DB への書き込みの経路。既定は RPC insert_chat（chats と chat_authors を 1 回で書く。Issue #179）。
 * SAVE_CHAT_WRITE=insert で以前の PostgREST の INSERT に戻せる（insert_chat に不具合があったときの逃げ道。
 * この経路では chat_authors を書かないので、その間の発言は clear で消せない）。
 */
export type WritePath = 'rpc' | 'insert';

export function readWritePath(env: (key: string) => string | undefined): WritePath {
  return env('SAVE_CHAT_WRITE') === 'insert' ? 'insert' : 'rpc';
}

/**
 * x-chat-author-key（端末ごとの 32 バイトの乱数を base64url にした 43 文字）。形が違えば null で、
 * その発言は後から clear で消せない。形の最終的な確かめと SHA-256 は DB（author_key_hash）が行う。
 */
export function readAuthorKey(headers: Headers): string | null {
  const key = headers.get('x-chat-author-key')?.trim() ?? '';
  return /^[A-Za-z0-9_-]{43}$/.test(key) ? key : null;
}

/** 行を順に保存する。1 回の要求で複数行（おみくじの巫女の返事など）を書くときも往復は 1 回 */
async function writeChats(
  supabase: SupabaseClient,
  path: WritePath,
  rows: ChatRow[],
  authorKey: string | null
): Promise<WriteResult> {
  if (path === 'rpc') {
    const { data, error } = await supabase.rpc('insert_chat', {
      p_chats: rows,
      p_author_key: authorKey,
    });
    return { data: (data as SavedRow[] | null) ?? null, error };
  }
  const { data, error } = await supabase
    .from('chats')
    .insert(rows.map(({ author: _author, ...row }) => row))
    // ip_masked / ua も返す。クライアントは楽観行をこの応答でマージするため、
    // これらを返さないと realtime INSERT との到着順によって表示が空に戻る。
    // rooms(triage) は triage の対象かを決めるために外部キー chats_room_id_fkey で埋め込む
    .select('uuid,room_id,time,ip_masked,ua,rooms(triage)');
  if (error || !data) return { data: null, error };
  return {
    data: (data as unknown as (Omit<SavedRow, 'triage'> & { rooms: { triage: boolean } | null })[]).map(
      ({ rooms, ...saved }) => ({ ...saved, triage: rooms?.triage === true })
    ),
    error: null,
  };
}

/** 23503: chats_room_id_fkey（知らない部屋）、YC001: chats_room_enabled（閉じた部屋） */
const ROOM_REJECTED = new Set(['23503', 'YC001']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Operation {
  id: string;
  source: 'client' | 'server';
  attempt?: number;
}

/**
 * 送信操作 1 件の ID と試行番号（spec R3.12）。リトライの全試行で同じ ID が来る。
 * 形式が不正・欠落ならサーバー側で発行し、source=server として区別する。
 */
export function readOperation(headers: Headers): Operation {
  const id = headers.get('x-chat-operation-id')?.trim() ?? '';
  const attempt = headers.get('x-chat-attempt')?.trim() ?? '';
  const parsedAttempt = /^[1-9]$/.test(attempt) ? Number(attempt) : undefined;
  if (UUID.test(id)) return { id: id.toLowerCase(), source: 'client', attempt: parsedAttempt };
  return { id: crypto.randomUUID(), source: 'server', attempt: parsedAttempt };
}

function operationAttributes(op: Operation) {
  return {
    'chat.operation.id': op.id,
    'chat.operation.id_source': op.source,
    'chat.attempt': op.attempt,
  };
}

interface Outcome {
  response: Response;
  background?: () => Promise<void>;
}

export function createHandler(deps: HandlerDeps) {
  const { tracer } = deps;
  const schedule = (task: Promise<unknown>) =>
    deps.waitUntil ? (deps.waitUntil(task), Promise.resolve()) : task;

  return async (req: Request): Promise<Response> => {
    const cors = buildCorsHeaders(req);
    // プリフライトはトレースしない（送信 1 回ごとに 1 本のトレースにするため）
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: cors });
    }

    const op = readOperation(req.headers);
    const server = tracer.startSpan(
      'POST save-chat',
      parseTraceparent(req.headers.get('traceparent')),
      SpanKind.SERVER,
      { 'http.request.method': req.method, 'http.route': '/save-chat', ...operationAttributes(op) }
    );

    let outcome: Outcome;
    try {
      outcome = await saveChat(req, cors, server, op, deps);
    } catch (err) {
      // DB 保存の失敗（db_insert_failed）など、先に分類済みのエラーコードは上書きしない
      if (!server.failed) server.failException('unhandled_error', err);
      outcome = { response: json({ error: 'Internal error' }, 500, cors) };
    }

    const { response, background } = outcome;
    server.setAttribute('http.response.status_code', response.status);
    if (response.status >= 500 && !server.failed) server.fail('http_5xx');
    server.end();
    // 1 回目の flush: 保存区間を triage と無関係に送る（spec R3.7）
    await schedule(tracer.flush());
    if (background) await schedule(background());
    return response;
  };
}

async function saveChat(
  req: Request,
  cors: Record<string, string>,
  server: Span,
  op: Operation,
  deps: HandlerDeps
): Promise<Outcome> {
  const { tracer } = deps;
  if (req.method !== 'POST') {
    return { response: reject('method_not_allowed', 405, cors) };
  }

  let body: SaveChatBody;
  try {
    body = await req.json();
  } catch {
    return { response: reject('invalid_json', 400, cors) };
  }
  if (typeof body !== 'object' || body === null) {
    return { response: reject('invalid_json', 400, cors) };
  }

  // 型と必須（name / message / room_id）。これは「記録だけ」の期間も拒否する（以前から拒否していた）
  if (!isNonEmptyString(body.room_id)) {
    return { response: reject('invalid_room_id', 400, cors) };
  }
  server.setAttribute('chat.room_id', body.room_id);
  if (!isNonEmptyString(body.name)) {
    return { response: reject('invalid_name', 400, cors) };
  }
  if (typeof body.message !== 'string' || body.message.trim().length === 0) {
    return { response: reject('invalid_message', 400, cors) };
  }

  // 上限と形式（schema.ts）。違反は記録し、enforce のときだけ拒否する
  const mode = readInputMode(deps.env);
  const input = checkSayInput({
    name: body.name,
    message: body.message,
    color: body.color,
    email: body.email,
  });
  if (input.violations.length > 0) {
    server.setAttribute('chat.input.violations', input.violations.join(','));
    tracer.log('WARN', 'save_chat.input_violation', server.context, {
      'chat.operation.id': op.id,
      'chat.room_id': body.room_id,
      'chat.input.violations': input.violations.join(','),
      'chat.input.mode': mode,
    });
  }
  // metadata は許可リストで作り直す（拒否はしない）。知らないキー・範囲外の値は落として記録する
  const metadata = sanitizeMetadata(body.metadata, Date.now());
  if (metadata.dropped.length > 0) {
    server.setAttribute('chat.metadata.dropped', metadata.dropped.join(','));
    tracer.log('WARN', 'save_chat.metadata_dropped', server.context, {
      'chat.operation.id': op.id,
      'chat.room_id': body.room_id,
      'chat.metadata.dropped': metadata.dropped.join(',').slice(0, 500),
    });
  }
  if (mode === 'enforce' && input.error) {
    server.setAttribute('error.code', input.error);
    return { response: reject(input.error, 400, cors) };
  }

  const supabaseUrl = deps.env('SUPABASE_URL');
  const serviceRoleKey = deps.env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    server.fail('server_misconfigured');
    return { response: json({ error: 'Server misconfigured' }, 500, cors) };
  }

  const supabase = deps.createSupabase(supabaseUrl, serviceRoleKey);
  const writePath = readWritePath(deps.env);
  server.setAttribute('chat.write_path', writePath);
  const authorKey = readAuthorKey(req.headers);
  server.setAttribute('chat.author_key', authorKey !== null);

  // ip / ua はサーバー観測値で確定（クライアント値は一切信用しない）。
  // ip_masked は ip から自動計算される生成列なので、ここでは渡さない。
  const row: Omit<ChatRow, 'author'> = {
    room_id: body.room_id,
    name: body.name,
    // 色は拒否せず置き換えるだけなので、記録だけの期間も規則に合わせる
    // （DB の CHECK 制約 chats_color_check は NOT VALID でも新しい行には効く）
    color: input.value.color,
    message: body.message,
    system: typeof body.system === 'boolean' ? body.system : false,
    email: typeof body.email === 'string' ? body.email : null,
    metadata: metadata.value,
    ip: resolveClientIp(req),
    ua: req.headers.get('user-agent') ?? '',
  };

  const db = tracer.startSpan('db insert chats', server.context, SpanKind.CLIENT, {
    'db.system.name': 'postgresql',
    'db.operation.name': 'insert',
    'db.collection.name': 'chats',
    'db.stored_procedure.name': writePath === 'rpc' ? 'insert_chat' : undefined,
    ...operationAttributes(op),
  });
  let result: WriteResult;
  try {
    result = injectedFault(deps, op)
      ? { data: null, error: { code: 'FAULT', message: 'injected fault (SAVE_CHAT_FAULT_INJECT)' } }
      : await writeChats(supabase, writePath, [{ ...row, author: true }], authorKey);
  } catch (err) {
    db.failException('db_insert_failed', err);
    db.end();
    server.fail('db_insert_failed');
    throw err;
  }
  const { error } = result;
  // 知らない部屋（外部キー）・閉じた部屋（トリガー chats_room_enabled）は入力の誤りとして返す
  if (error && ROOM_REJECTED.has(error.code ?? '')) {
    db.end();
    server.setAttribute('error.code', 'invalid_room_id');
    return { response: reject('invalid_room_id', 400, cors) };
  }
  const data = result.data?.[0];
  if (error || !data) {
    db.failDb('db_insert_failed', error ?? {});
    db.end();
    tracer.log('ERROR', 'save_chat.db_insert_failed', db.context, {
      'chat.operation.id': op.id,
      'chat.attempt': op.attempt,
      'db.response.status_code': error?.code,
      'error.message': error?.message?.slice(0, 500),
    });
    // C2（save-chat の 5xx）で C1（保存失敗）と重複させないための印
    server.fail('db_insert_failed');
    return {
      response: json(
        { error: `Failed to save chat: ${error?.message ?? 'no row returned'}` },
        500,
        cors
      ),
    };
  }
  db.end();

  // 管理者チャットの発言は JEV で振り分ける（機能要求なら Issue 化 + 管理人返信）。
  // 外部 API 待ちで送信レスポンスを遅らせないよう、返却後にバックグラウンドで実行する。
  const { triage: triageRoom, ...saved } = data;
  const triage = shouldTriage({ ...row, triageRoom });
  server.setAttribute('chat.triage', triage);
  const target = {
    uuid: data.uuid,
    room_id: row.room_id,
    name: row.name,
    color: row.color,
    message: row.message,
  };
  return {
    response: json(saved, 200, cors),
    background: triage
      ? () =>
          runTriage(tracer, server.context, deps.triageDeadlineMs ?? 45_000, (trace) =>
            triageAdminChat(supabase, target, trace)
          )
      : undefined,
  };
}

/** staging / local だけで有効な故障注入（spec Task 2.7）。本番では無視する。 */
function injectedFault(deps: HandlerDeps, op: Operation): boolean {
  if (deps.environment === 'production') return false;
  return deps.env('SAVE_CHAT_FAULT_INJECT') === 'attempt1' && (op.attempt ?? 1) === 1;
}

/**
 * triage を期限付きで動かす（spec R3.7 / R3.10）。成功・失敗・期限切れのどれでも
 * triage スパンを閉じてから 2 回目の flush を行う。waitUntil は実行時間の上限を
 * 延長しないので、期限内に flush まで終わらせる。
 */
export async function runTriage(
  tracer: Tracer,
  parent: SpanContext,
  deadlineMs: number,
  run: (trace: TriageTrace) => Promise<void>
): Promise<void> {
  const span = tracer.startSpan('triage', parent, SpanKind.INTERNAL);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'deadline'>((resolve) => {
    timer = setTimeout(() => {
      controller.abort(new DOMException('triage deadline exceeded', 'TimeoutError'));
      resolve('deadline');
    }, deadlineMs);
  });
  try {
    const result = await Promise.race([
      run({ tracer, span, signal: controller.signal }).then(() => 'done' as const),
      deadline,
    ]);
    if (result === 'deadline') span.fail('triage_deadline');
  } catch (err) {
    span.failException('triage_failed', err);
  } finally {
    clearTimeout(timer);
    // C7（triage.failed の件数）が数えるイベント。失敗・期限切れのどちらもここで 1 回だけ出す
    if (span.failed) {
      tracer.log('ERROR', 'triage.failed', span.context, { 'error.code': span.errorCode });
    }
    span.end();
    await tracer.flush();
  }
}
