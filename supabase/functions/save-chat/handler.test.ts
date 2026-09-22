// deno test --allow-env --allow-read supabase/functions/save-chat/
import { assert, assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHandler, readOperation, runTriage, type HandlerDeps } from './handler.ts';
import { Tracer, type FinishedSpan } from './telemetry.ts';

const TRACE_A = '0af7651916cd43dd8448eb211c80319c';
const TRACE_B = '4bf92f3577b34da6a3ce929d0e0e4736';
const PARENT = 'b7ad6b7169203331';
const OP_ID = '6f2d9c3e-1a4b-4c8d-9e0f-123456789abc';

type Row = Record<string, unknown>;
interface FakeDbOptions {
  insertError?: { code: string; message: string };
  insertThrows?: boolean;
  delayMs?: number;
}

function fakeSupabase(options: FakeDbOptions = {}) {
  const inserts: Row[] = [];
  const client = {
    from(_table: string) {
      return {
        insert(row: Row) {
          inserts.push(row);
          const result = async () => {
            if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
            if (options.insertThrows) throw new TypeError('connection reset');
            if (options.insertError) return { data: null, error: options.insertError };
            return {
              data: { uuid: crypto.randomUUID(), room_id: row.room_id, time: 1 },
              error: null,
            };
          };
          const query = {
            select: () => query,
            single: result,
            // replyAsAdmin は insert(...) を直接 await する
            then: (ok: (v: unknown) => unknown, ng: (e: unknown) => unknown) =>
              result()
                .then(({ error }) => ({ error }), undefined)
                .then(ok, ng),
          };
          return query;
        },
        select() {
          const chain = {
            eq: () => chain,
            like: () => chain,
            gte: () => Promise.resolve({ count: 0, error: null }),
          };
          return chain;
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, inserts };
}

function setup(
  options: FakeDbOptions & { env?: Record<string, string>; environment?: string } = {}
) {
  const exported: FinishedSpan[][] = [];
  const logs: ExportedLog[] = [];
  const pending: Promise<unknown>[] = [];
  const tracer = new Tracer({
    serviceName: 'save-chat',
    environment: 'test',
    licenseKey: 'test-key',
    send: (url, init) => {
      const body = JSON.parse(String(init.body));
      if (url.endsWith('/v1/logs')) {
        for (const r of body.resourceLogs[0].scopeLogs[0].logRecords) {
          logs.push({
            ...r,
            attributes: Object.fromEntries(
              (r.attributes as { key: string; value: Record<string, unknown> }[]).map((a) => [
                a.key,
                Object.values(a.value)[0],
              ])
            ),
          });
        }
        return Promise.resolve(new Response('{}'));
      }
      exported.push(
        body.resourceSpans[0].scopeSpans[0].spans.map((s: Record<string, unknown>) => ({
          ...s,
          attributes: Object.fromEntries(
            (s.attributes as { key: string; value: Record<string, unknown> }[]).map((a) => [
              a.key,
              Object.values(a.value)[0],
            ])
          ),
        }))
      );
      return Promise.resolve(new Response('{}'));
    },
  });
  const db = fakeSupabase(options);
  const env: Record<string, string> = {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
    ...options.env,
  };
  const deps: HandlerDeps = {
    tracer,
    env: (key) => env[key],
    createSupabase: () => db.client,
    waitUntil: (task) => {
      pending.push(task);
    },
    environment: options.environment ?? 'local',
    triageDeadlineMs: 200,
  };
  return {
    handler: createHandler(deps),
    exported,
    logs,
    pending,
    inserts: db.inserts,
    /** waitUntil に登録された処理が終わるまで待ち、送られたスパンを平らにして返す */
    async settle() {
      await Promise.all(pending);
      return exported.flat() as unknown as ExportedSpan[];
    },
  };
}

interface ExportedLog {
  severityText: string;
  body: { stringValue: string };
  traceId?: string;
  spanId?: string;
  attributes: Record<string, unknown>;
}

interface ExportedSpan {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  attributes: Record<string, unknown>;
  status?: { code: number };
}

function post(body: Row, headers: Record<string, string> = {}) {
  return new Request('https://example.supabase.co/functions/v1/save-chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'SecretBrowser/1.0',
      'x-forwarded-for': '203.0.113.9',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const chat = { room_id: 'main', name: 'たろう', color: '#ff0000', message: 'こんにちは' };
const byName = (spans: ExportedSpan[], name: string) => spans.find((s) => s.name === name)!;

Deno.test(
  '保存成功: 呼び出し元の traceparent を親にし、DB スパンを子にする（sampled=00 でも記録）',
  async () => {
    const t = setup();
    const res = await t.handler(
      post(chat, {
        traceparent: `00-${TRACE_A}-${PARENT}-00`,
        'x-chat-operation-id': OP_ID,
        'x-chat-attempt': '1',
      })
    );
    assertEquals(res.status, 200);
    const spans = await t.settle();
    const server = byName(spans, 'POST save-chat');
    const db = byName(spans, 'db insert chats');
    assertEquals(server.traceId, TRACE_A);
    assertEquals(server.parentSpanId, PARENT);
    assertEquals(db.traceId, TRACE_A);
    assertEquals(db.parentSpanId, server.spanId);
    assertEquals(server.attributes['http.response.status_code'], '200');
    assertEquals(server.attributes['chat.operation.id'], OP_ID);
    assertEquals(server.attributes['chat.attempt'], '1');
    assertEquals(db.attributes['chat.operation.id'], OP_ID);
    assertEquals(db.attributes['db.operation.name'], 'insert');
    assertEquals(server.status, undefined);
  }
);

Deno.test('プリフライトはトレースしない', async () => {
  const t = setup();
  const res = await t.handler(
    new Request('https://example.supabase.co/functions/v1/save-chat', {
      method: 'OPTIONS',
      headers: { 'access-control-request-headers': 'traceparent,x-chat-operation-id' },
    })
  );
  assertEquals(res.headers.get('access-control-allow-headers'), 'traceparent,x-chat-operation-id');
  assertEquals((await t.settle()).length, 0);
});

Deno.test('早期 return（400 / 405）でもサーバースパンを送る。4xx はエラーにしない', async () => {
  const t = setup();
  assertEquals((await t.handler(post({ ...chat, name: '' }))).status, 400);
  assertEquals(
    (await t.handler(new Request('https://example.supabase.co/functions/v1/save-chat'))).status,
    405
  );
  const spans = await t.settle();
  assertEquals(spans.length, 2);
  for (const span of spans) assertEquals(span.status, undefined);
  assertEquals(t.inserts.length, 0);
});

Deno.test(
  'DB 保存失敗: DB スパンに PostgREST の code と message、サーバースパンに db_insert_failed',
  async () => {
    const t = setup({
      insertError: { code: '23514', message: 'new row violates check constraint' },
    });
    const res = await t.handler(post(chat));
    assertEquals(res.status, 500);
    // クライアントへの応答は従来どおり（spec R4.4 は取りやめ）
    assertEquals(
      (await res.json()).error,
      'Failed to save chat: new row violates check constraint'
    );
    const spans = await t.settle();
    const server = byName(spans, 'POST save-chat');
    const db = byName(spans, 'db insert chats');
    assertEquals(db.status, { code: 2 });
    assertEquals(db.attributes['db.response.status_code'], '23514');
    assertEquals(db.attributes['error.message'], 'new row violates check constraint');
    assertEquals(server.status, { code: 2 });
    assertEquals(server.attributes['error.code'], 'db_insert_failed');
    assertEquals(server.attributes['http.response.status_code'], '500');
  }
);

Deno.test('DB 呼び出しが例外を投げても 500 を返し、スパンを送る', async () => {
  const t = setup({ insertThrows: true });
  const res = await t.handler(post(chat));
  assertEquals(res.status, 500);
  const spans = await t.settle();
  assertEquals(byName(spans, 'db insert chats').attributes['error.type'], 'TypeError');
  assertEquals(byName(spans, 'POST save-chat').attributes['error.code'], 'db_insert_failed');
});

Deno.test('送信先（New Relic）の失敗はチャットの応答を変えない', async () => {
  const handler = createHandler({
    tracer: new Tracer({
      serviceName: 'save-chat',
      environment: 'test',
      licenseKey: 'k',
      send: () => Promise.reject(new TypeError('offline')),
    }),
    env: (k) => ({ SUPABASE_URL: 'https://x', SUPABASE_SERVICE_ROLE_KEY: 'k' })[k],
    createSupabase: () => fakeSupabase().client,
    environment: 'local',
  });
  const res = await handler(post(chat));
  assertEquals(res.status, 200);
});

Deno.test('操作 ID: 正しい UUID は使い、不正・欠落ならサーバーで発行する', () => {
  const ok = readOperation(new Headers({ 'x-chat-operation-id': OP_ID, 'x-chat-attempt': '2' }));
  assertEquals(ok, { id: OP_ID, source: 'client', attempt: 2 });
  for (const headers of <Record<string, string>[]>[
    {},
    { 'x-chat-operation-id': 'not-a-uuid' },
    { 'x-chat-operation-id': `${OP_ID}x` },
  ]) {
    const op = readOperation(new Headers(headers));
    assertEquals(op.source, 'server');
    assert(/^[0-9a-f-]{36}$/.test(op.id));
  }
  assertEquals(readOperation(new Headers({ 'x-chat-attempt': '12' })).attempt, undefined);
  assertEquals(readOperation(new Headers({ 'x-chat-attempt': '0' })).attempt, undefined);
});

Deno.test('本文・名前・IP・UA はスパンに載せない', async () => {
  const t = setup({ insertError: { code: '23514', message: 'check failed' } });
  await t.handler(post(chat, { traceparent: `00-${TRACE_A}-${PARENT}-01` }));
  const payload = JSON.stringify(await t.settle());
  for (const secret of [chat.message, chat.name, '203.0.113.9', 'SecretBrowser']) {
    assertEquals(payload.includes(secret), false, secret);
  }
});

Deno.test('故障注入: local では 1 回目の試行だけ失敗させ、production では無視する', async () => {
  const env = { SAVE_CHAT_FAULT_INJECT: 'attempt1' };
  const local = setup({ env });
  const first = await local.handler(
    post(chat, { 'x-chat-operation-id': OP_ID, 'x-chat-attempt': '1' })
  );
  const second = await local.handler(
    post(chat, { 'x-chat-operation-id': OP_ID, 'x-chat-attempt': '2' })
  );
  assertEquals([first.status, second.status], [500, 200]);
  const spans = (await local.settle()).filter((s) => s.name === 'db insert chats');
  assertEquals(
    spans.map((s) => [s.attributes['chat.attempt'], s.status?.code ?? 0]),
    [
      ['1', 2],
      ['2', 0],
    ]
  );
  // 同じ操作の 2 回の試行は、別々のトレースになっても操作 ID で束ねられる
  assertEquals(new Set(spans.map((s) => s.attributes['chat.operation.id'])).size, 1);

  const prod = setup({ env, environment: 'production' });
  assertEquals((await prod.handler(post(chat, { 'x-chat-attempt': '1' }))).status, 200);
});

// ---- triage（応答後の非同期処理） ----

function withTriageEnv(fn: () => Promise<void>) {
  return async () => {
    Deno.env.set('JEV_API_TOKEN', 'jev-token');
    Deno.env.set('GITHUB_TOKEN', 'gh-token');
    const realFetch = globalThis.fetch;
    try {
      await fn();
    } finally {
      globalThis.fetch = realFetch;
      Deno.env.delete('JEV_API_TOKEN');
      Deno.env.delete('GITHUB_TOKEN');
    }
  };
}

const adminChat = { ...chat, room_id: 'com_sb', message: '使い方を教えて' };
const jevReply = (choice: string) =>
  new Response(
    JSON.stringify({
      status: 'completed',
      checks: { choice: { choice, probabilities: { [choice]: 0.9 } } },
    }),
    { headers: { 'content-type': 'application/json' } }
  );

Deno.test(
  'triage: 保存と同じトレースの子になり、JEV への送信に traceparent を付ける',
  withTriageEnv(async () => {
    const sentHeaders: Headers[] = [];
    globalThis.fetch = (_input, init) => {
      sentHeaders.push(new Headers(init?.headers));
      return Promise.resolve(jevReply('question'));
    };
    const t = setup();
    const res = await t.handler(post(adminChat, { traceparent: `00-${TRACE_A}-${PARENT}-01` }));
    assertEquals(res.status, 200);
    const spans = await t.settle();
    const server = byName(spans, 'POST save-chat');
    const triage = byName(spans, 'triage');
    const jev = byName(spans, 'POST /api/v1/evaluate');
    for (const span of spans) assertEquals(span.traceId, TRACE_A);
    assertEquals(triage.parentSpanId, server.spanId);
    assertEquals(jev.parentSpanId, triage.spanId);
    assertEquals(sentHeaders[0]!.get('traceparent'), `00-${TRACE_A}-${jev.spanId}-01`);
    assertEquals(triage.attributes['triage.outcome'], 'no_action');
    assertEquals(jev.attributes['triage.choice'], 'question');
    // 1 回目（保存区間）と 2 回目（triage 区間）に分けて送る
    assertEquals(t.exported.length, 2);
    assertEquals(t.exported[0]!.map((s) => s.name).sort(), ['POST save-chat', 'db insert chats']);
  })
);

Deno.test(
  'triage: 終わらない場合でも保存区間は 1 回目で送り、期限で triage スパンを閉じる',
  withTriageEnv(async () => {
    globalThis.fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        // 期限の中断で reject される（それまで応答しない）
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      });
    const t = setup();
    const res = await t.handler(post(adminChat));
    assertEquals(res.status, 200);
    // 応答の時点で、保存区間はすでに送られている
    await t.pending[0];
    assertEquals(t.exported[0]!.map((s) => s.name).sort(), ['POST save-chat', 'db insert chats']);
    const spans = await t.settle();
    const triage = byName(spans, 'triage');
    assertEquals(triage.status, { code: 2 });
    assertEquals(triage.attributes['error.code'], 'triage_deadline');
    // C7 が数える triage.failed が、triage スパンと同じトレースで 1 件だけ出る
    const failed = t.logs.filter((l) => l.body.stringValue === 'triage.failed');
    assertEquals(failed.length, 1);
    assertEquals(failed[0]!.traceId, triage.traceId);
    assertEquals(failed[0]!.spanId, triage.spanId);
    assertEquals(failed[0]!.attributes['error.code'], 'triage_deadline');
  })
);

Deno.test('runTriage: 処理が reject しても triage スパンを閉じて flush する', async () => {
  const exported: Record<string, string> = {};
  const tracer = new Tracer({
    serviceName: 't',
    environment: 'test',
    licenseKey: 'k',
    send: (url, init) => {
      exported[url.endsWith('/v1/logs') ? 'logs' : 'traces'] = String(init.body);
      return Promise.resolve(new Response('{}'));
    },
  });
  await runTriage(tracer, { traceId: TRACE_A, spanId: PARENT }, 1000, () =>
    Promise.reject(new RangeError('boom'))
  );
  assert(exported.traces!.includes('triage_failed'));
  assert(exported.traces!.includes('RangeError'));
  // reject でも C7 が数える triage.failed が出る
  assert(exported.logs!.includes('triage.failed'));
  assert(exported.logs!.includes('triage_failed'));
});

Deno.test(
  'triage: 同時に 2 件処理してもスパンは各自のトレースにだけ属する',
  withTriageEnv(async () => {
    globalThis.fetch = async () => {
      await new Promise((r) => setTimeout(r, 5 + Math.random() * 20));
      return jevReply('chat');
    };
    const t = setup({ delayMs: 5 });
    await Promise.all([
      t.handler(post(adminChat, { traceparent: `00-${TRACE_A}-${PARENT}-01` })),
      t.handler(post(adminChat, { traceparent: `00-${TRACE_B}-${PARENT}-01` })),
    ]);
    const spans = await t.settle();
    for (const traceId of [TRACE_A, TRACE_B]) {
      const own = spans.filter((s) => s.traceId === traceId);
      assertEquals(own.map((s) => s.name).sort(), [
        'POST /api/v1/evaluate',
        'POST save-chat',
        'db insert chats',
        'triage',
      ]);
      const ids = new Set(own.map((s) => s.spanId));
      for (const span of own) {
        if (span.name !== 'POST save-chat') assert(ids.has(span.parentSpanId!), span.name);
      }
    }
  })
);
