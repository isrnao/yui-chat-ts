// two-shot のリクエスト処理本体。index.ts は Deno.serve に渡すだけにして、依存（保存先・時刻・乱数・
// IP の取り出し・Tracer）を差し替えてテストできるようにする（save-chat/handler.ts と同じ作り）。
// spec: .kiro/specs/two-shot-chat/design.md §7
//
// 流れ: 要求の検証 → 部屋（と入室記録）を読む → rules.ts の applyCommand で次の状態を計算する →
//       two_shot_commit で version の CAS と付随記録を保存する（競合したら読み直して最大 3 回）。
// 認可は anon key ではなく、本機能のトークン（x-two-shot-token）と席で行う。
// トークン・要求と応答の本文・IP・UA・入力値はトレースにもログにも出さない（Requirement 12.7）。

import {
  applyCommand,
  isRoomId,
  isSex,
  LOG_SIZE_LIMIT,
  normalizeEntry,
  parseRoomState,
  sjisSize,
  toRoomView,
  type AdmissionRecord,
  type Command,
  type Context,
  type EnterCommand,
  type ErrorCode,
  type Outcome,
  type RoomState,
  type RoomView,
} from './rules.ts';
import { parseTraceparent, SpanKind, type Span, type Tracer } from '../save-chat/telemetry.ts';

/** JSON のボディの上限（UTF-8） */
export const MAX_BODY_BYTES = 64 * 1024;
/** user-agent の上限（UTF-8） */
export const MAX_UA_BYTES = 1024;
/** version の競合で読み直す回数の上限 */
export const MAX_CAS_ATTEMPTS = 3;
/**
 * 会話の控え（Q4(b)）を保存するか。サーバー側で固定し、クライアントからは変えられない
 * （requirements.md Requirement 15.5）。
 */
export const AUDIT_ENABLED = true;

const TOKEN_PATTERN = /^v1\.(\d{1,15})\.([A-Za-z0-9_-]{43})$/;

// ---------------------------------------------------------------------------
// 保存先
// ---------------------------------------------------------------------------

export type RoomRow = { version: number; state: unknown };

export type CommitInput = {
  roomId: string;
  expectedVersion: number;
  evaluatedAtMs: number;
  nextState: RoomState | null;
  admission: {
    tokenHash: string;
    requestHash: string;
    attemptAtMs: number;
    memberId: string | null;
    result: 'accepted' | 'duplicate' | 'full';
  } | null;
  audit: {
    atMs: number;
    memberId: string;
    seat: 0 | 1;
    name: string;
    text: string;
    ip: string | null;
  } | null;
};

export type CommitResult = 'committed' | 'conflict' | 'admission-conflict' | 'expired-entry';

/** two_shot_rooms / two_shot_admissions / two_shot_commit を読み書きする。失敗は例外にする */
export interface TwoShotStore {
  loadRoom(roomId: string): Promise<RoomRow | null>;
  loadAdmission(tokenHash: string): Promise<AdmissionRecord | null>;
  commit(input: CommitInput): Promise<CommitResult>;
}

export interface HandlerDeps {
  tracer: Tracer;
  /** リクエストごとの保存先（DB のスパンをサーバースパンの子にする）。環境変数が足りなければ null（500） */
  store: (server: Span) => TwoShotStore | null;
  now: () => number;
  randomUUID: () => string;
  /** 信頼できるプロキシが確定した IP。確定できなければ null（重複入室の判定をしない） */
  resolveIp: (req: Request) => string | null;
  /** Edge Runtime では EdgeRuntime.waitUntil。未定義ならその場で await する */
  waitUntil?: (promise: Promise<unknown>) => void;
}

// ---------------------------------------------------------------------------
// 応答の形（src/features/two-shot-chat/protocol.ts と同じ）
// ---------------------------------------------------------------------------

export type TwoShotResponse =
  | { ok: true; screen: 'room'; room: RoomView }
  | { ok: true; screen: 'lobby' }
  | { ok: false; notice: ErrorCode; placement: 'page' | 'pane' };

function buildHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      req.headers.get('access-control-request-headers') ??
      'authorization, x-client-info, apikey, content-type, x-two-shot-token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// IP
// ---------------------------------------------------------------------------

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6 = /^[0-9A-Fa-f:.]+$/;

function isIp(value: string): boolean {
  const v4 = IPV4.exec(value);
  if (v4) return v4.slice(1).every((part) => Number(part) <= 255);
  return value.includes(':') && IPV6.test(value) && value.length <= 45;
}

/**
 * 信頼境界を設定した IP の取り出し方を作る（design.md §7「handler と認証境界」）。
 *
 * save-chat の resolveClientIp は x-forwarded-for の先頭を無条件に読むが、先頭はクライアントが自由に
 * 付けられるので、重複入室の判定の根拠には使わない。デプロイ先のプロキシがどのヘッダを上書き・追記するかを
 * 確かめたうえで、環境変数 TWO_SHOT_TRUSTED_IP_HEADER に次のどちらかを設定する。
 *   - `<ヘッダ名>`: プロキシが上書きするヘッダ（例: `x-real-ip`）の値をそのまま使う
 *   - `x-forwarded-for:<n>`: 末尾から n 番目（1 始まり）の値を使う。プロキシが追記した値だけを信じる
 * 未設定・形式が不正なら常に null（重複入室の判定をしない。安全側）。
 */
export function createIpResolver(spec: string | undefined): (req: Request) => string | null {
  const trimmed = spec?.trim().toLowerCase() ?? '';
  if (trimmed === '') return () => null;
  const forwarded = /^x-forwarded-for:(\d+)$/.exec(trimmed);
  if (forwarded) {
    const fromEnd = Number(forwarded[1]);
    if (fromEnd < 1) return () => null;
    return (req) => {
      const hops = (req.headers.get('x-forwarded-for') ?? '')
        .split(',')
        .map((hop) => hop.trim())
        .filter((hop) => hop !== '');
      const value = hops[hops.length - fromEnd];
      return value !== undefined && isIp(value) ? value : null;
    };
  }
  if (!/^[a-z0-9-]+$/.test(trimmed)) return () => null;
  return (req) => {
    const value = req.headers.get(trimmed)?.trim() ?? '';
    return isIp(value) ? value : null;
  };
}

// ---------------------------------------------------------------------------
// 要求の検証
// ---------------------------------------------------------------------------

type ParsedToken = { token: string; createdAt: number };

/** `v1.<作成時刻の Unix ミリ秒>.<32 バイトの base64url>`。形式が違えば null */
export function parseToken(value: string | null): ParsedToken | null | 'invalid' {
  if (value === null || value === '') return null;
  const match = TOKEN_PATTERN.exec(value);
  if (!match) return 'invalid';
  const createdAt = Number(match[1]);
  if (!Number.isSafeInteger(createdAt)) return 'invalid';
  return { token: value, createdAt };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 正規化した入室要求のハッシュ。IP / UA は含めない（同じ試行の再送中に回線が変わっても回復できる） */
export function requestHashInput(room: string, entry: EnterCommand): string {
  const e = normalizeEntry(entry);
  return JSON.stringify(['v1', room, e.name, e.sex, e.profile, e.make]);
}

async function readBody(req: Request): Promise<string | 'too-large' | 'invalid'> {
  const length = Number(req.headers.get('content-length') ?? '0');
  if (length > MAX_BODY_BYTES) return 'too-large';
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return 'too-large';
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return 'invalid';
  }
}

type ParsedRequest =
  | { kind: 'ok'; room: string; cmd: Command }
  | { kind: 'unselected' }
  | { kind: 'bad'; reason: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseRequest(body: unknown): ParsedRequest {
  if (!isObject(body)) return { kind: 'bad', reason: 'body must be an object' };
  const { room, op } = body;
  if (typeof room !== 'string') return { kind: 'bad', reason: 'room is required' };
  // 部屋を選ばずに入室した（原作の E1）。お知らせとして返す
  if (op === 'enter' && room === '') return { kind: 'unselected' };
  if (!isRoomId(room)) return { kind: 'bad', reason: 'unknown room' };
  switch (op) {
    case 'enter': {
      const { name, sex, profile, make } = body;
      if (typeof name !== 'string' || !isSex(sex) || typeof profile !== 'string') {
        return { kind: 'bad', reason: 'invalid entry' };
      }
      if (typeof make !== 'boolean') return { kind: 'bad', reason: 'invalid entry' };
      return { kind: 'ok', room, cmd: { op, name, sex, profile, make } };
    }
    case 'say': {
      if (typeof body.text !== 'string') return { kind: 'bad', reason: 'text is required' };
      if (sjisSize(body.text) > LOG_SIZE_LIMIT)
        return { kind: 'bad', reason: 'message is too long' };
      return { kind: 'ok', room, cmd: { op, text: body.text } };
    }
    case 'read':
    case 'clear':
    case 'leave':
    case 'kick':
    case 'close':
      return { kind: 'ok', room, cmd: { op } };
    default:
      return { kind: 'bad', reason: 'unknown op' };
  }
}

// ---------------------------------------------------------------------------
// handler
// ---------------------------------------------------------------------------

export function createHandler(deps: HandlerDeps) {
  const { tracer } = deps;
  const schedule = (task: Promise<unknown>) =>
    deps.waitUntil ? (deps.waitUntil(task), Promise.resolve()) : task;

  return async (req: Request): Promise<Response> => {
    const headers = buildHeaders(req);
    if (req.method === 'OPTIONS') return new Response('ok', { headers });

    const server = tracer.startSpan(
      'POST two-shot',
      parseTraceparent(req.headers.get('traceparent')),
      SpanKind.SERVER,
      { 'http.request.method': req.method, 'http.route': '/two-shot' }
    );

    let response: Response;
    try {
      response = await handle(req, headers, server, deps);
    } catch (err) {
      if (!server.failed) server.failException('unhandled_error', err);
      response = json({ error: 'Internal error' }, 500, headers);
    }
    server.setAttribute('http.response.status_code', response.status);
    if (response.status >= 500 && !server.failed) server.fail('http_5xx');
    server.end();
    await schedule(tracer.flush());
    return response;
  };
}

async function handle(
  req: Request,
  headers: Record<string, string>,
  server: Span,
  deps: HandlerDeps
): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, headers);

  const ua = req.headers.get('user-agent') ?? '';
  if (new TextEncoder().encode(ua).byteLength > MAX_UA_BYTES) {
    return json({ error: 'user-agent is too long' }, 400, headers);
  }

  const raw = await readBody(req);
  if (raw === 'too-large') return json({ error: 'Payload too large' }, 413, headers);
  if (raw === 'invalid') return json({ error: 'Invalid body' }, 400, headers);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, headers);
  }

  const parsed = parseRequest(body);
  if (parsed.kind === 'unselected') {
    server.setAttributes({ 'two_shot.op': 'enter', 'two_shot.outcome': 'E1' });
    return json(notice('E1', 'page'), 200, headers);
  }
  if (parsed.kind === 'bad') return json({ error: parsed.reason }, 400, headers);
  const { room, cmd } = parsed;
  server.setAttributes({ 'two_shot.room': room, 'two_shot.op': cmd.op });

  const token = parseToken(req.headers.get('x-two-shot-token'));
  if (token === 'invalid') return json({ error: 'invalid token' }, 400, headers);
  if (cmd.op === 'enter' && token === null)
    return json({ error: 'token is required' }, 400, headers);
  const tokenHash = token === null ? null : await sha256Hex(token.token);
  const requestHash = cmd.op === 'enter' ? await sha256Hex(requestHashInput(room, cmd)) : null;

  const store = deps.store(server);
  if (store === null) {
    server.fail('server_misconfigured');
    return json({ error: 'Server misconfigured' }, 500, headers);
  }

  // 同じ要求の CAS の再試行では同じ Member_ID を使う
  const newMemberId = deps.randomUUID();
  const ip = deps.resolveIp(req);

  for (let attempt = 1; attempt <= MAX_CAS_ATTEMPTS; attempt++) {
    server.setAttribute('two_shot.cas_attempts', attempt);
    let row = await loadRoom(store, room);
    const admission =
      cmd.op === 'enter' && tokenHash !== null ? await store.loadAdmission(tokenHash) : null;
    // 入室記録を部屋より後に読むので、同じ試行の同時の入室が確定した直後だと「記録は accepted なのに
    // 読んだ部屋に席がない」ことがある。部屋を読み直してから失効を判断する
    if (admission?.result === 'accepted' && !isSeated(row.state, admission.memberId, tokenHash)) {
      row = await loadRoom(store, room);
    }

    const now = deps.now();
    const ctx: Context = {
      roomId: room,
      now,
      tokenHash,
      admission,
      requestHash,
      entryCreatedAt: token === null ? null : token.createdAt,
      newMemberId,
      ip,
      ua,
    };
    const t = applyCommand(row.state, cmd, ctx);
    if (t.outcome.kind === 'invalid-request') {
      server.setAttribute('two_shot.outcome', 'invalid');
      return json({ error: t.outcome.reason }, 400, headers);
    }

    if (t.state === row.state && t.admission === null) {
      return respond(t.outcome, t.state, room, now, server, headers);
    }

    const said = AUDIT_ENABLED ? t.said : null;
    const result = await store.commit({
      roomId: room,
      expectedVersion: row.version,
      evaluatedAtMs: now,
      nextState: t.state === row.state ? null : t.state,
      admission:
        t.admission === null || tokenHash === null || requestHash === null || token === null
          ? null
          : {
              tokenHash,
              requestHash,
              attemptAtMs: token.createdAt,
              memberId: t.admission.memberId,
              result: t.admission.result,
            },
      audit:
        said === null
          ? null
          : {
              atMs: said.line.at,
              memberId: said.line.memberId,
              seat: said.seat,
              name: said.line.name,
              text: said.line.text,
              ip: t.state.seats[said.seat]?.ip ?? null,
            },
    });
    if (result === 'committed') return respond(t.outcome, t.state, room, now, server, headers);
    if (result === 'expired-entry') {
      server.setAttribute('two_shot.outcome', 'E4');
      return json(notice('E4', 'page'), 200, headers);
    }
    // conflict / admission-conflict だけ読み直して評価し直す（DB の例外は再試行しない）
  }

  server.fail('cas_conflict');
  return json({ error: 'conflict' }, 503, headers);
}

type ParsedRoomRow = { version: number; state: RoomState };

async function loadRoom(store: TwoShotStore, room: string): Promise<ParsedRoomRow> {
  const row = await store.loadRoom(room);
  if (row === null) throw new Error(`room ${room} is missing`);
  const state = parseRoomState(row.state);
  if (state === null) throw new Error(`room ${room} has an invalid state`);
  return { version: row.version, state };
}

function isSeated(state: RoomState, memberId: string | null, tokenHash: string | null): boolean {
  return state.seats.some(
    (seat) => seat !== null && seat.memberId === memberId && seat.tokenHash === tokenHash
  );
}

function notice(code: ErrorCode, placement: 'page' | 'pane'): TwoShotResponse {
  return { ok: false, notice: code, placement };
}

function respond(
  outcome: Outcome,
  state: RoomState,
  room: string,
  now: number,
  server: Span,
  headers: Record<string, string>
): Response {
  switch (outcome.kind) {
    case 'room': {
      server.setAttribute('two_shot.outcome', 'room');
      const body: TwoShotResponse = {
        ok: true,
        screen: 'room',
        room: toRoomView(room, state, outcome.seat, now),
      };
      return json(body, 200, headers);
    }
    case 'lobby':
      server.setAttribute('two_shot.outcome', 'lobby');
      return json({ ok: true, screen: 'lobby' } satisfies TwoShotResponse, 200, headers);
    case 'notice':
      server.setAttribute('two_shot.outcome', outcome.code);
      return json(notice(outcome.code, outcome.placement), 200, headers);
    case 'invalid-request':
      return json({ error: outcome.reason }, 400, headers);
  }
}

// ---------------------------------------------------------------------------
// Supabase の保存先
// ---------------------------------------------------------------------------

type QueryResult<T> = { data: T | null; error: { message?: string; code?: string } | null };

/** supabase-js（service_role）で読み書きする。PostgREST の型には依存しない最小の形で受ける */
export interface SupabaseLike {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string
      ): { maybeSingle(): PromiseLike<QueryResult<Record<string, unknown>>> };
    };
  };
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<QueryResult<unknown>>;
}

export function createSupabaseStore(
  client: SupabaseLike,
  tracer: Tracer,
  parent: Span
): TwoShotStore {
  const query = async <T>(
    name: string,
    run: () => PromiseLike<QueryResult<T>>
  ): Promise<T | null> => {
    const span = tracer.startSpan(name, parent.context, SpanKind.CLIENT, {
      'db.system.name': 'postgresql',
    });
    try {
      const { data, error } = await run();
      if (error) {
        span.failDb('db_failed', error);
        throw new Error(`${name} failed`);
      }
      return data;
    } catch (err) {
      if (!span.failed) span.failException('db_failed', err);
      throw err;
    } finally {
      span.end();
    }
  };

  return {
    async loadRoom(roomId) {
      const data = await query('db select two_shot_rooms', () =>
        client.from('two_shot_rooms').select('version,state').eq('room_id', roomId).maybeSingle()
      );
      if (data === null) return null;
      return { version: Number(data.version), state: data.state };
    },
    async loadAdmission(tokenHash) {
      const data = await query('db select two_shot_admissions', () =>
        client
          .from('two_shot_admissions')
          .select('room_id,request_hash,member_id,result')
          .eq('token_hash', tokenHash)
          .maybeSingle()
      );
      if (data === null) return null;
      const result = data.result;
      if (result !== 'accepted' && result !== 'duplicate' && result !== 'full') {
        throw new Error('invalid admission record');
      }
      return {
        roomId: String(data.room_id),
        requestHash: String(data.request_hash),
        memberId: data.member_id === null ? null : String(data.member_id),
        result,
      };
    },
    async commit(input) {
      const data = await query('db rpc two_shot_commit', () =>
        client.rpc('two_shot_commit', {
          p_room_id: input.roomId,
          p_expected_version: input.expectedVersion,
          p_evaluated_at_ms: input.evaluatedAtMs,
          p_next_state: input.nextState,
          p_admission: input.admission,
          p_audit: input.audit,
        })
      );
      if (
        data !== 'committed' &&
        data !== 'conflict' &&
        data !== 'admission-conflict' &&
        data !== 'expired-entry'
      ) {
        throw new Error('unexpected commit result');
      }
      return data;
    },
  };
}
