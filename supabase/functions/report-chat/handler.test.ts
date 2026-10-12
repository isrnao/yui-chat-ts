// deno test --allow-env --allow-read supabase/functions/report-chat/
import { assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHandler } from './handler.ts';
import {
  checkReport,
  REPORT_DETAIL_MAX,
  REPORT_GLOBAL_LIMIT_PER_HOUR,
  REPORT_LIMIT_PER_HOUR,
  REPORT_REASONS,
} from './schema.ts';
import { createIpResolver } from '../_shared/request.ts';
import { Tracer } from '../save-chat/telemetry.ts';

const CHAT = '0192f6a0-0000-7000-8000-000000000001';
type Row = Record<string, unknown>;

type Result = { status: string; report_id: string | null; first_for_chat?: boolean };

function setup(
  result: Result | null = { status: 'ok', report_id: 'r-1', first_for_chat: true },
  trustedIpHeader?: string
) {
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
      return Promise.resolve(
        result ? { data: [result], error: null } : { data: null, error: { message: 'boom' } }
      );
    },
  } as unknown as SupabaseClient;
  const handler = createHandler({
    tracer,
    env: (key) => ({ SUPABASE_URL: 'http://db', SUPABASE_SERVICE_ROLE_KEY: 'service' })[key],
    createSupabase: () => client,
    resolveRateIp: createIpResolver(trustedIpHeader),
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
  const { handler, calls } = setup(undefined, 'x-forwarded-for:1');
  const res = await handler(
    post(
      { chat_uuid: CHAT.toUpperCase(), reason: 'harassment', detail: '  ひどい  ' },
      {
        'x-forwarded-for': '198.51.100.1, 10.0.0.1',
        'user-agent': 'UA',
        'x-chat-author-key': 'A'.repeat(43),
      }
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
      // 制限には、信頼できる位置（プロキシが足した末尾）の IP だけを使う
      p_rate_ip: '10.0.0.1',
      p_limit: REPORT_LIMIT_PER_HOUR,
      p_global_limit: REPORT_GLOBAL_LIMIT_PER_HOUR,
    },
  ]);
});

Deno.test('信頼できる位置が決まっていなければ、送る側が付けた IP では数えない', async () => {
  const { handler, calls } = setup();
  await handler(post({ chat_uuid: CHAT, reason: 'spam' }, { 'x-forwarded-for': '198.51.100.1' }));
  assertEquals(calls[0].p_ip, '198.51.100.1');
  assertEquals(calls[0].p_rate_ip, '');
});

Deno.test('入力の誤りは 400 のコードで返し、保存しない', async () => {
  const cases: [unknown, string][] = [
    ['not json', 'invalid_json'],
    [[], 'invalid_json'],
    [{ chat_uuid: 'x', reason: 'spam' }, 'invalid_chat_uuid'],
    [{ chat_uuid: CHAT, reason: 'nope' }, 'invalid_reason'],
    [{ chat_uuid: CHAT, reason: 'spam', detail: 1 }, 'invalid_detail'],
    [
      { chat_uuid: CHAT, reason: 'spam', detail: 'あ'.repeat(REPORT_DETAIL_MAX + 1) },
      'invalid_detail',
    ],
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
    [{ status: 'rate_limited_global', report_id: null }, 429, 'rate_limited'],
  ] as const) {
    const { handler, logs } = setup(result);
    const res = await handler(post({ chat_uuid: CHAT, reason: 'spam' }));
    assertEquals(res.status, status);
    assertEquals(await res.json(), { error: { code } });
    // 全体の上限に当たったら運営が気づけるように WARN
    assertEquals(
      logs.some((log) => log.event === 'report_chat.global_limit' && log.level === 'WARN'),
      result.status === 'rate_limited_global'
    );
  }
  const { handler } = setup(null);
  assertEquals((await handler(post({ chat_uuid: CHAT, reason: 'spam' }))).status, 500);
});

Deno.test(
  '児童の安全に関わる通報は、その発言への最初の 1 件だけ ERROR でアラートに載せ、本文は送らない',
  async () => {
    const { handler, logs } = setup();
    await handler(post({ chat_uuid: CHAT, reason: 'child_safety', detail: '秘密の説明' }));
    assertEquals(
      logs.map((log) => `${log.level} ${log.event}`),
      ['INFO report_chat.received', 'ERROR report_chat.child_safety']
    );
    assertEquals(logs[1].attributes['report.reason'], 'child_safety');
    assertEquals(JSON.stringify(logs).includes('秘密の説明'), false);

    // 同じ発言への 2 件目からはアラートを出さない
    const second = setup({ status: 'ok', report_id: 'r-2', first_for_chat: false });
    await second.handler(post({ chat_uuid: CHAT, reason: 'child_safety' }));
    assertEquals(
      second.logs.map((log) => log.event),
      ['report_chat.received']
    );
  }
);

Deno.test('同じ人が同じ発言をもう一度通報したら、前の通報を返してアラートは出さない', async () => {
  const { handler, logs } = setup({ status: 'duplicate', report_id: 'r-1', first_for_chat: false });
  const res = await handler(post({ chat_uuid: CHAT, reason: 'child_safety' }));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { id: 'r-1' });
  assertEquals(
    logs.map((log) => log.event),
    ['report_chat.duplicate']
  );
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
  const sql = await Deno.readTextFile(
    new URL('../../migrations/20261012000000_chat_reports.sql', import.meta.url)
  );
  const listed = sql
    .match(/reason IN \(([^)]+)\)/)?.[1]
    ?.match(/'([a-z_]+)'/g)
    ?.map((s) => s.slice(1, -1));
  assertEquals(listed, [...REPORT_REASONS]);
});

Deno.test('checkReport は説明の前後の空白を除く', () => {
  assertEquals(checkReport({ chat_uuid: CHAT, reason: 'other', detail: ' x ' }), {
    chatUuid: CHAT,
    reason: 'other',
    detail: 'x',
  });
  assertEquals(checkReport({ chat_uuid: CHAT, reason: 'other' }), {
    chatUuid: CHAT,
    reason: 'other',
    detail: '',
  });
});
