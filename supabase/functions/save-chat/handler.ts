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
import {
  buildAdminChat,
  buildFortuneChat,
  FORTUNE_MESSAGES,
  isFortuneCommand,
  type AdminEvent,
} from './messages.ts';
import {
  checkName,
  checkSayInput,
  clampInt,
  DEFAULT_COLOR,
  normalizeColor,
  readNonce,
  sanitizeMetadata,
  VISIT_COUNT_MAX,
  type InputErrorCode,
} from './schema.ts';
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
  /** 0 以上 1 未満の乱数（おみくじの運勢を選ぶ）。テストで固定する。既定は Math.random */
  random?: () => number;
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
type ErrorCode = InputErrorCode | 'method_not_allowed' | 'invalid_json' | 'invalid_op';

function reject(code: ErrorCode, status: number, cors: Record<string, string>): Response {
  return json({ error: { code } }, status, cors);
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

// クライアントが詐称・上書きできないよう、読むフィールドを限定する。
// uuid / time / deleted / ip / ua / system は受け付けない（system はサーバーが作る発言だけが true）。
interface SaveChatBody {
  /** say（省略時。利用者の発言）/ enter / exit（入退室。管理人の発言をサーバーが作る） */
  op?: unknown;
  room_id?: unknown;
  name?: unknown;
  color?: unknown;
  message?: unknown;
  email?: unknown;
  metadata?: unknown;
  /** 入室だけ: 訪問回数と前回のログイン（端末の中の値。範囲に丸める） */
  visit_count?: unknown;
  last_login?: unknown;
  /** 入退室: 楽観的な行と突き合わせる nonce */
  nonce?: unknown;
}

type ChatOp = 'say' | AdminEvent;

function readOp(value: unknown): ChatOp | null {
  // 既定値を使うのは省略したときだけ。null を含め、知らない値は invalid_op
  if (value === undefined || value === 'say') return 'say';
  return value === 'enter' || value === 'exit' ? value : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** insert_chat が返す、保存した行（triage は部屋の rooms.triage。クライアントには返さない） */
interface SavedRow {
  uuid: string;
  room_id: string;
  time: number;
  ip_masked: string;
  ua: string;
  name: string;
  color: string;
  message: string;
  system: boolean;
  metadata: unknown;
  triage: boolean;
}

/** insert_chat に渡す行 */
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

/**
 * x-chat-author-key（端末ごとの鍵）。形の確かめと SHA-256 は DB（author_key_hash）が行い、形が違えばその発言は
 * 後から clear で消せないだけなので、ここでは長さだけを抑えてそのまま渡す
 */
function readAuthorKey(headers: Headers): string | null {
  const key = headers.get('x-chat-author-key')?.trim() ?? '';
  return key.length > 0 && key.length <= 128 ? key : null;
}

/** 要求から決めた、保存する行（ip / ua は後で足す）。拒否するときは reject */
type Plan =
  | { rows: Omit<ChatRow, 'ip' | 'ua'>[]; dropped: string[] }
  | { reject: InputErrorCode; violation: string };

/**
 * 利用者の発言（op: say）。本文が「おみくじ」なら、巫女の返事も同じ要求で保存する（Issue #181）。
 * insert_chat は配列の順に入れるので、巫女の返事は必ず利用者の発言の後に並ぶ。
 */
function planSay(
  body: SaveChatBody & { room_id: string; name: string },
  pickFortune: () => number
): Plan {
  if (typeof body.message !== 'string') {
    return { reject: 'invalid_message', violation: 'message_not_string' };
  }
  const input = checkSayInput({
    name: body.name,
    message: body.message,
    color: body.color,
    email: body.email,
  });
  if (input.error) return { reject: input.error, violation: input.violation };
  const { name, message, color, email } = input.value;
  // metadata は許可リストで作り直す（拒否はしない）。知らないキー・範囲外の値は落として記録する
  const metadata = sanitizeMetadata(body.metadata);
  return {
    rows: [
      {
        room_id: body.room_id,
        name,
        color,
        message,
        system: false,
        email,
        metadata: metadata.value,
        author: true,
      },
      ...(isFortuneCommand(message)
        ? [
            {
              room_id: body.room_id,
              ...buildFortuneChat(name, pickFortune()),
              email: null,
              author: false,
            },
          ]
        : []),
    ],
    dropped: metadata.dropped,
  };
}

/**
 * 入退室の管理人の発言（op: enter / exit、Issue #180）。文言と metadata はサーバーが messages.ts で作る。
 * 名前・色・訪問回数・前回のログインだけを受け取り、範囲を確かめる（端末の中の値なので本人確認は無い）。
 */
function planAdmin(
  event: AdminEvent,
  body: SaveChatBody & { room_id: string; name: string }
): Plan {
  const nameError = checkName(body.name);
  if (nameError) return { reject: nameError.error, violation: nameError.violation };
  const nonce = readNonce(body.nonce);
  const chat = buildAdminChat({
    event,
    name: body.name.trim(),
    color: normalizeColor(body.color) ?? DEFAULT_COLOR,
    visitCount: clampInt(body.visit_count, VISIT_COUNT_MAX),
    lastLogin: clampInt(body.last_login, Date.now()),
    nonce,
  });
  return {
    rows: [{ room_id: body.room_id, email: null, ...chat, author: false }],
    dropped: body.nonce !== undefined && nonce === undefined ? ['nonce'] : [],
  };
}

/** 要求の本文を読み、保存する行を決める。読めない・規則に合わないときは拒否の応答を返す */
async function planRequest(
  req: Request,
  cors: Record<string, string>,
  server: Span,
  op: Operation,
  deps: HandlerDeps
): Promise<{ plan: Extract<Plan, { rows: unknown }>; roomId: string } | { response: Response }> {
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

  const chatOp = readOp(body.op);
  if (!chatOp) {
    return { response: reject('invalid_op', 400, cors) };
  }
  server.setAttribute('chat.op', chatOp);

  if (!isNonEmptyString(body.room_id)) {
    return { response: reject('invalid_room_id', 400, cors) };
  }
  server.setAttribute('chat.room_id', body.room_id);
  if (!isNonEmptyString(body.name)) {
    return { response: reject('invalid_name', 400, cors) };
  }

  const checked = body as SaveChatBody & { room_id: string; name: string };
  const plan =
    chatOp === 'say'
      ? planSay(checked, () => Math.floor((deps.random ?? Math.random)() * FORTUNE_MESSAGES.length))
      : planAdmin(chatOp, checked);

  if ('reject' in plan) {
    server.setAttribute('error.code', plan.reject);
    server.setAttribute('chat.input.violation', plan.violation);
    deps.tracer.log('WARN', 'save_chat.input_rejected', server.context, {
      'chat.operation.id': op.id,
      'chat.room_id': checked.room_id,
      'chat.input.violation': plan.violation,
    });
    return { response: reject(plan.reject, 400, cors) };
  }
  if (plan.dropped.length > 0) {
    server.setAttribute('chat.metadata.dropped', plan.dropped.join(','));
    deps.tracer.log('WARN', 'save_chat.metadata_dropped', server.context, {
      'chat.operation.id': op.id,
      'chat.room_id': checked.room_id,
      'chat.metadata.dropped': plan.dropped.join(',').slice(0, 500),
    });
  }
  return { plan, roomId: checked.room_id };
}

/** 23503: chats_room_id_fkey（知らない部屋） */
const UNKNOWN_ROOM = '23503';

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
  const planned = await planRequest(req, cors, server, op, deps);
  if ('response' in planned) return planned;
  return await persist(req, cors, server, op, deps, planned.plan.rows);
}

/** 保存して応答を作る。1 回の insert_chat で、要求の行（おみくじなら巫女の返事も）をまとめて入れる */
async function persist(
  req: Request,
  cors: Record<string, string>,
  server: Span,
  op: Operation,
  deps: HandlerDeps,
  planned: Omit<ChatRow, 'ip' | 'ua'>[]
): Promise<Outcome> {
  const { tracer } = deps;
  const supabaseUrl = deps.env('SUPABASE_URL');
  const serviceRoleKey = deps.env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    server.fail('server_misconfigured');
    return { response: json({ error: 'Server misconfigured' }, 500, cors) };
  }
  const supabase = deps.createSupabase(supabaseUrl, serviceRoleKey);
  const authorKey = readAuthorKey(req.headers);
  server.setAttribute('chat.author_key', authorKey !== null);

  // ip / ua はサーバー観測値で確定（クライアント値は一切信用しない）。
  // ip_masked は ip から自動計算される生成列なので、ここでは渡さない。
  const observed = { ip: resolveClientIp(req), ua: req.headers.get('user-agent') ?? '' };
  const rows: ChatRow[] = planned.map((row) => ({ ...row, ...observed }));

  const db = tracer.startSpan('db insert chats', server.context, SpanKind.CLIENT, {
    'db.system.name': 'postgresql',
    'db.operation.name': 'insert',
    'db.collection.name': 'chats',
    'db.stored_procedure.name': 'insert_chat',
    ...operationAttributes(op),
  });
  let result: { data: SavedRow[] | null; error: { code?: string; message?: string } | null };
  try {
    result = injectedFault(deps, op)
      ? { data: null, error: { code: 'FAULT', message: 'injected fault (SAVE_CHAT_FAULT_INJECT)' } }
      : await supabase.rpc('insert_chat', {
          p_chats: rows,
          p_author_key: authorKey,
          // 同じ送信操作の再送（保存の直後に通信が切れた場合など）は、新しく入れずに 1 回目の行が返る
          p_operation_id: op.id,
        });
  } catch (err) {
    db.failException('db_insert_failed', err);
    db.end();
    server.fail('db_insert_failed');
    throw err;
  }
  const { data, error } = result;
  // 知らない部屋（外部キー）は入力の誤りとして返す
  if (error?.code === UNKNOWN_ROOM) {
    db.end();
    server.setAttribute('error.code', 'invalid_room_id');
    return { response: reject('invalid_room_id', 400, cors) };
  }
  if (error || !data || data.length < rows.length) {
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

  // 応答は保存された行から作る。2 行目以降（おみくじの巫女の返事）は extra として返し、クライアントは Realtime を
  // 待たずにログへ入れる。同じ送信操作の再送では 1 回目の行が返るので、選び直した運勢ではなく保存済みの返事になる
  const [first, ...rest] = data.map(({ triage, ...saved }) => ({ saved, triage }));
  const extra = rest.map(({ saved }) => saved);

  // 管理者チャットの発言は JEV で振り分ける（機能要求なら Issue 化 + 管理人返信）。
  // 外部 API 待ちで送信レスポンスを遅らせないよう、返却後にバックグラウンドで実行する。
  const triage = shouldTriage({ ...first.saved, triageRoom: first.triage });
  server.setAttribute('chat.triage', triage);
  const target = {
    uuid: first.saved.uuid,
    room_id: first.saved.room_id,
    name: first.saved.name,
    color: first.saved.color,
    message: first.saved.message,
  };
  return {
    response: json(extra.length > 0 ? { ...first.saved, extra } : first.saved, 200, cors),
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
