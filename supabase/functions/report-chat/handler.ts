// report-chat の要求の処理。依存（Supabase のクライアント・Tracer）を差し替えてテストできるようにする。
//
// - 保存は SQL 関数 insert_chat_report 1 回（1 時間 10 件の制限・通報の時点の写し・端末の鍵のハッシュ）
// - 通報の本文と対象の発言は公開の場所（GitHub の Issue など）に出さない。New Relic には理由と id だけを送る
// - 児童の安全に関わる通報（child_safety）は ERROR のログにし、New Relic のアラートから運営に知らせる

import type { SupabaseClient } from '@supabase/supabase-js';
import { checkReport, REPORT_LIMIT_PER_HOUR, type ReportErrorCode } from './schema.ts';
import { parseTraceparent, SpanKind, type Tracer } from '../save-chat/telemetry.ts';

export interface HandlerDeps {
  tracer: Tracer;
  env: (key: string) => string | undefined;
  createSupabase: (url: string, serviceRoleKey: string) => SupabaseClient;
  waitUntil?: (promise: Promise<unknown>) => void;
}

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

type ErrorCode = ReportErrorCode | 'chat_not_found' | 'rate_limited';

function reject(code: ErrorCode, status: number, cors: Record<string, string>): Response {
  return json({ error: { code } }, status, cors);
}

/** save-chat と同じく x-forwarded-for の先頭 → x-real-ip */
function resolveClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || '';
}

function readAuthorKey(headers: Headers): string | null {
  const key = headers.get('x-chat-author-key')?.trim() ?? '';
  return key.length > 0 && key.length <= 128 ? key : null;
}

type InsertResult = { status: 'ok' | 'not_found' | 'rate_limited'; report_id: string | null };

export function createHandler(deps: HandlerDeps) {
  const { tracer } = deps;
  const schedule = (task: Promise<unknown>) =>
    deps.waitUntil ? (deps.waitUntil(task), Promise.resolve()) : task;

  return async (req: Request): Promise<Response> => {
    const cors = buildCorsHeaders(req);
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors);

    const span = tracer.startSpan(
      'POST report-chat',
      parseTraceparent(req.headers.get('traceparent')),
      SpanKind.SERVER,
      { 'http.request.method': req.method, 'http.route': '/report-chat' }
    );
    let response: Response;
    try {
      response = await report(req, cors, deps, span.context);
    } catch (err) {
      span.failException('unhandled_error', err);
      response = json({ error: 'Internal error' }, 500, cors);
    }
    span.setAttribute('http.response.status_code', response.status);
    if (response.status >= 500 && !span.failed) span.fail('http_5xx');
    span.end();
    await schedule(tracer.flush());
    return response;
  };

  async function report(
    req: Request,
    cors: Record<string, string>,
    deps: HandlerDeps,
    context: Parameters<Tracer['log']>[2]
  ): Promise<Response> {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return reject('invalid_json', 400, cors);
    }
    const input = checkReport(body);
    if ('error' in input) return reject(input.error, 400, cors);

    const supabaseUrl = deps.env('SUPABASE_URL');
    const serviceRoleKey = deps.env('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server misconfigured' }, 500, cors);
    const supabase = deps.createSupabase(supabaseUrl, serviceRoleKey);

    const { data, error } = await supabase.rpc('insert_chat_report', {
      p_chat_uuid: input.chatUuid,
      p_reason: input.reason,
      p_detail: input.detail,
      p_author_key: readAuthorKey(req.headers),
      p_ip: resolveClientIp(req),
      p_ua: req.headers.get('user-agent') ?? '',
      p_limit: REPORT_LIMIT_PER_HOUR,
    });
    const result = (Array.isArray(data) ? data[0] : data) as InsertResult | null;
    if (error || !result) {
      tracer.log('ERROR', 'report_chat.db_insert_failed', context, {
        'error.message': error?.message?.slice(0, 500),
      });
      return json({ error: 'Failed to save report' }, 500, cors);
    }
    if (result.status === 'not_found') return reject('chat_not_found', 404, cors);
    if (result.status === 'rate_limited') return reject('rate_limited', 429, cors);

    // 本文は送らない。child_safety は ERROR にしてアラートの対象にする
    tracer.log(
      input.reason === 'child_safety' ? 'ERROR' : 'INFO',
      'report_chat.received',
      context,
      {
        'report.id': result.report_id ?? undefined,
        'report.reason': input.reason,
        'report.child_safety': input.reason === 'child_safety',
      }
    );
    return json({ id: result.report_id }, 200, cors);
  }
}
