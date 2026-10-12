// deno test --allow-env --allow-read supabase/functions/report-chat/
import { assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHandler } from './handler.ts';
import { checkReport, REPORT_DETAIL_MAX, REPORT_LIMIT_PER_HOUR, REPORT_REASONS } from './schema.ts';
import { Tracer } from '../save-chat/telemetry.ts';

const CHAT = '0192f6a0-0000-7000-8000-000000000001';
type Row = Record<string, unknown>;

function setup(result: { status: string; report_id: string | null } | null = { status: 'ok', report_id: 'r-1' }) {
  const calls: Row[] = [];
  const logs: { level: string; event: string; attributes: Row }[] = [];
  const tracer = new Tracer({ serviceName: 'report-chat', environment: 'test' });
  const original = tracer.log.bind(tracer);
  tracer.log = (level, event, parent, attributes = {}) => {
    logs.push({ level, event, attributes: attributes as Row });
    original(level, event, parent, attributes);
  };
  const client = {
    rpc(name: string, args: Row) {
      calls.push({ name, ...args });
      return Promise.resolve(result ? { data: [result], error: null } : { data: null, error: { message: 'boom' } });
    },
  } as unknown as SupabaseClient;
  const handler = createHandler({
    tracer,
    env: (key) => ({ SUPABASE_URL: 'http://db', SUPABASE_SERVICE_ROLE_KEY: 'service' })[key],
    createSupabase: () => client,
  });
  return { handler, calls, logs };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/report-chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

Deno.test('通報を保存し、IP・UA・端末の鍵を添えて insert_chat_report を呼ぶ', async () => {
  const { handler, calls } = setup();
  const res = await handler(
    post(
      { chat_uuid: CHAT.toUpperCase(), reason: 'harassment', detail: '  ひどい  ' },
      { 'x-forwarded-for': '198.51.100.1, 10.0.0.1', 'user-agent': 'UA', 'x-chat-author-key': 'A'.repeat(43) }
    )
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { id: 'r-1' });
  assertEquals(calls, [
    {
      name: 'insert_chat_report',
      p_chat_uuid: CHAT,
      p_reason: 'harassment',
      p_detail: 'ひどい',
      p_author_key: 'A'.repeat(43),
      p_ip: '198.51.100.1',
      p_ua: 'UA',
      p_limit: REPORT_LIMIT_PER_HOUR,
    },
  ]);
});

Deno.test('入力の誤りは 400 のコードで返し、保存しない', async () => {
  const cases: [unknown, string][] = [
    ['not json', 'invalid_json'],
    [[], 'invalid_json'],
    [{ chat_uuid: 'x', reason: 'spam' }, 'invalid_chat_uuid'],
    [{ chat_uuid: CHAT, reason: 'nope' }, 'invalid_reason'],
    [{ chat_uuid: CHAT, reason: 'spam', detail: 1 }, 'invalid_detail'],
    [{ chat_uuid: CHAT, reason: 'spam', detail: 'あ'.repeat(REPORT_DETAIL_MAX + 1) }, 'invalid_detail'],
  ];
  for (const [body, code] of cases) {
    const { handler, calls } = setup();
    const res = await handler(post(body));
    assertEquals(res.status, 400);
    assertEquals(await res.json(), { error: { code } });
    assertEquals(calls.length, 0);
  }
});

Deno.test('無い発言は 404、制限を超えたら 429、DB の失敗は 500', async () => {
  for (const [result, status, code] of [
    [{ status: 'not_found', report_id: null }, 404, 'chat_not_found'],
    [{ status: 'rate_limited', report_id: null }, 429, 'rate_limited'],
  ] as const) {
    const { handler } = setup(result);
    const res = await handler(post({ chat_uuid: CHAT, reason: 'spam' }));
    assertEquals(res.status, status);
    assertEquals(await res.json(), { error: { code } });
  }
  const { handler } = setup(null);
  assertEquals((await handler(post({ chat_uuid: CHAT, reason: 'spam' }))).status, 500);
});

Deno.test('児童の安全に関わる通報は ERROR のログでアラートに載せ、本文は送らない', async () => {
  const { handler, logs } = setup();
  await handler(post({ chat_uuid: CHAT, reason: 'child_safety', detail: '秘密の説明' }));
  const received = logs.find((log) => log.event === 'report_chat.received');
  assertEquals(received?.level, 'ERROR');
  assertEquals(received?.attributes['report.child_safety'], true);
  assertEquals(JSON.stringify(logs).includes('秘密の説明'), false);
});

Deno.test('プリフライトは要求されたヘッダを許す', async () => {
  const { handler } = setup();
  const res = await handler(
    new Request('http://localhost/report-chat', {
      method: 'OPTIONS',
      headers: { 'access-control-request-headers': 'apikey, x-chat-author-key' },
    })
  );
  assertEquals(res.headers.get('access-control-allow-headers'), 'apikey, x-chat-author-key');
});

Deno.test('理由の一覧は migration の CHECK と同じ', async () => {
  const sql = await Deno.readTextFile(new URL('../../migrations/20261012000000_chat_reports.sql', import.meta.url));
  const listed = sql.match(/reason IN \(([^)]+)\)/)?.[1]?.match(/'([a-z_]+)'/g)?.map((s) => s.slice(1, -1));
  assertEquals(listed, [...REPORT_REASONS]);
});

Deno.test('checkReport は説明の前後の空白を除く', () => {
  assertEquals(checkReport({ chat_uuid: CHAT, reason: 'other', detail: ' x ' }), {
    chatUuid: CHAT,
    reason: 'other',
    detail: 'x',
  });
  assertEquals(checkReport({ chat_uuid: CHAT, reason: 'other' }), { chatUuid: CHAT, reason: 'other', detail: '' });
});
