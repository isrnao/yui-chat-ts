// report-chat の要求の処理。依存（Supabase のクライアント・Tracer）を差し替えてテストできるようにする。
//
// - 保存は SQL 関数 insert_chat_report 1 回（通報者ごとと全体の 1 時間の上限・同じ発言の重複・通報の時点の写し・
//   端末の鍵のハッシュ）
// - 制限に使う IP は REPORT_TRUSTED_IP_HEADER で決めた信頼できる位置からだけ取る（x-forwarded-for の先頭は送る側が
//   付けられるので、記録にだけ使う）。未設定なら IP では数えず、端末の鍵と全体の上限で止める
// - 通報の本文と対象の発言は公開の場所（GitHub の Issue など）に出さない。New Relic には理由と id だけを送る
// - 児童の安全に関わる通報（child_safety）は、その発言への最初の 1 件だけ report_chat.child_safety（ERROR）を出し、
//   New Relic のアラート（C8）から運営に知らせる

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  checkReport,
  REPORT_GLOBAL_LIMIT_PER_HOUR,
  REPORT_LIMIT_PER_HOUR,
  type ReportErrorCode,
} from './schema.ts';
import { parseTraceparent, SpanKind, type Tracer } from '../save-chat/telemetry.ts';
import { readClient, resolveObservedIp } from '../_shared/request.ts';

export interface HandlerDeps {
  tracer: Tracer;
  env: (key: string) => string | undefined;
  createSupabase: (url: string, serviceRoleKey: string) => SupabaseClient;
  waitUntil?: (promise: Promise<unknown>) => void;
  /** 制限に使う IP（信頼できる位置。無ければ null）。index.ts が REPORT_TRUSTED_IP_HEADER から作る */
  resolveRateIp?: (req: Request) => string | null;
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

function readAuthorKey(headers: Headers): string | null {
  const key = headers.get('x-chat-author-key')?.trim() ?? '';
  return key.length > 0 && key.length <= 128 ? key : null;
}

type InsertResult = {
  status: 'ok' | 'duplicate' | 'not_found' | 'rate_limited' | 'rate_limited_global';
  report_id: string | null;
  first_for_chat: boolean;
};

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
      {
        'http.request.method': req.method,
        'http.route': '/report-chat',
        'client.app': readClient(req.headers),
      }
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
      p_ip: resolveObservedIp(req),
      p_ua: req.headers.get('user-agent') ?? '',
      p_rate_ip: deps.resolveRateIp?.(req) ?? '',
      p_limit: REPORT_LIMIT_PER_HOUR,
      p_global_limit: REPORT_GLOBAL_LIMIT_PER_HOUR,
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
    if (result.status === 'rate_limited_global') {
      // 全体の上限に当たるのは、まとめて送られているとき。運営が気づけるように WARN にする
      tracer.log('WARN', 'report_chat.global_limit', context, { 'report.reason': input.reason });
      return reject('rate_limited', 429, cors);
    }
    // 同じ人が同じ発言をもう一度通報した。受け付けた扱いにし、アラートは出さない
    if (result.status === 'duplicate') {
      tracer.log('INFO', 'report_chat.duplicate', context, { 'report.reason': input.reason });
      return json({ id: result.report_id }, 200, cors);
    }

    // 本文は送らない。理由と id だけ
    const attributes = {
      'report.id': result.report_id ?? undefined,
      'report.reason': input.reason,
    };
    tracer.log('INFO', 'report_chat.received', context, attributes);
    // child_safety は、その発言への最初の通報だけをアラートの対象にする（同じ発言で何度も呼び出さない）
    if (input.reason === 'child_safety' && result.first_for_chat) {
      tracer.log('ERROR', 'report_chat.child_safety', context, attributes);
    }
    return json({ id: result.report_id }, 200, cors);
  }
}
