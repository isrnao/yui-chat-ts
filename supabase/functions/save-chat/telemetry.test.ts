// deno test --allow-env --allow-read supabase/functions/save-chat/
import { assertEquals } from 'jsr:@std/assert@1';
import { encodeSpans, formatTraceparent, parseTraceparent, SpanKind, Tracer } from './telemetry.ts';

const TRACE = '0af7651916cd43dd8448eb211c80319c';
const SPAN = 'b7ad6b7169203331';

Deno.test(
  'traceparent: 正しい形式なら trace ID と親スパン ID を読む（sampled=00 でも読む）',
  () => {
    assertEquals(parseTraceparent(`00-${TRACE}-${SPAN}-01`), { traceId: TRACE, spanId: SPAN });
    assertEquals(parseTraceparent(`00-${TRACE}-${SPAN}-00`), { traceId: TRACE, spanId: SPAN });
  }
);

Deno.test('traceparent: 不正な形式・ゼロの ID は null（新しいトレースにする）', () => {
  for (const value of [
    null,
    '',
    'garbage',
    `01-${TRACE}-${SPAN}-01`,
    `00-${'0'.repeat(32)}-${SPAN}-01`,
    `00-${TRACE}-${'0'.repeat(16)}-01`,
    `00-${TRACE}-${SPAN}`,
  ]) {
    assertEquals(parseTraceparent(value), null, String(value));
  }
});

Deno.test('traceparent: 送信先へは sampled=01 で渡す', () => {
  assertEquals(formatTraceparent({ traceId: TRACE, spanId: SPAN }), `00-${TRACE}-${SPAN}-01`);
});

Deno.test('子スパンは親の trace ID を引き継ぎ、親がなければ新しい trace ID を作る', () => {
  const tracer = new Tracer({ serviceName: 't', environment: 'test', licenseKey: 'k' });
  const root = tracer.startSpan('root', null);
  const child = tracer.startSpan('child', root.context);
  assertEquals(child.context.traceId, root.context.traceId);
  assertEquals(root.context.traceId.length, 32);
  child.end();
  root.end();
  assertEquals(tracer.pending()[0]?.parentSpanId, root.context.spanId);
  assertEquals(tracer.pending()[1]?.parentSpanId, undefined);
});

Deno.test('OTLP JSON: 属性の型・状態・リソースを変換する', () => {
  const body = encodeSpans(
    [
      {
        name: 's',
        kind: SpanKind.SERVER,
        traceId: TRACE,
        spanId: SPAN,
        start: 1n,
        end: 2n,
        attributes: { str: 'a', int: 3, dbl: 0.5, bool: true },
        error: true,
      },
    ],
    { serviceName: 'save-chat', environment: 'production' }
  );
  const rs = body.resourceSpans[0]!;
  assertEquals(rs.resource.attributes, [
    { key: 'service.name', value: { stringValue: 'save-chat' } },
    { key: 'deployment.environment.name', value: { stringValue: 'production' } },
  ]);
  const span = rs.scopeSpans[0]!.spans[0]!;
  assertEquals(span.attributes, [
    { key: 'str', value: { stringValue: 'a' } },
    { key: 'int', value: { intValue: '3' } },
    { key: 'dbl', value: { doubleValue: 0.5 } },
    { key: 'bool', value: { boolValue: true } },
  ]);
  assertEquals(span.status, { code: 2 });
  assertEquals(span.startTimeUnixNano, '1');
  assertEquals('parentSpanId' in span, false);
});

Deno.test('performance.timeOrigin が未定義（Supabase Edge Runtime）でも時刻を作れる', async () => {
  // 2026-09-22 の本番障害の再現: timeOrigin が undefined だと NaN になり BigInt で例外が出た。
  // telemetry.ts はモジュール読み込み時に基準時刻を決めるので、未定義にしてから読み直す。
  const original = Object.getOwnPropertyDescriptor(Performance.prototype, 'timeOrigin');
  Object.defineProperty(Performance.prototype, 'timeOrigin', {
    configurable: true,
    get: () => undefined,
  });
  try {
    assertEquals(performance.timeOrigin as number | undefined, undefined);
    const fresh = await import(`./telemetry.ts?no-time-origin=${crypto.randomUUID()}`);
    const tracer = new fresh.Tracer({ serviceName: 't', environment: 'test', licenseKey: 'k' });
    const before = BigInt(Date.now()) * 1_000_000n;
    tracer.startSpan('s', null).end();
    const [span] = tracer.pending();
    assertEquals(typeof span.start, 'bigint');
    // 実時刻（Unix エポック）に近いこと（±5 秒）
    const drift = span.start - before;
    assertEquals(drift < 5_000_000_000n && drift > -5_000_000_000n, true);
    assertEquals(span.end >= span.start, true);
  } finally {
    if (original) Object.defineProperty(Performance.prototype, 'timeOrigin', original);
  }
});

Deno.test('ライセンスキーがなければ記録も送信もしない', async () => {
  let sent = 0;
  const tracer = new Tracer({
    serviceName: 't',
    environment: 'test',
    send: () => {
      sent++;
      return Promise.resolve(new Response('{}'));
    },
  });
  tracer.startSpan('s', null).end();
  await tracer.flush();
  assertEquals(tracer.pending().length, 0);
  assertEquals(sent, 0);
});

Deno.test('flush は送ったスパンをキューから外し、送信が失敗しても reject しない', async () => {
  const bodies: unknown[] = [];
  const tracer = new Tracer({
    serviceName: 't',
    environment: 'test',
    licenseKey: 'k',
    send: (_url, init) => {
      bodies.push(JSON.parse(String(init.body)));
      return Promise.reject(new TypeError('network down'));
    },
  });
  tracer.startSpan('a', null).end();
  await tracer.flush();
  await tracer.flush(); // 空なので送らない
  assertEquals(bodies.length, 1);
  assertEquals(tracer.pending().length, 0);
});

Deno.test('DB エラーは code と message（先頭 500 文字）を残し、例外は種類だけを残す', () => {
  const tracer = new Tracer({ serviceName: 't', environment: 'test', licenseKey: 'k' });
  tracer
    .startSpan('db', null)
    .failDb('db_insert_failed', { code: '23505', message: 'x'.repeat(600) })
    .end();
  tracer
    .startSpan('ex', null)
    .failException('jev_request_failed', new TypeError('secret body'))
    .end();
  const [db, ex] = tracer.pending();
  assertEquals(db!.attributes['db.response.status_code'], '23505');
  assertEquals(String(db!.attributes['error.message']).length, 500);
  assertEquals(db!.error, true);
  assertEquals(ex!.attributes['error.type'], 'TypeError');
  assertEquals(JSON.stringify(ex!.attributes).includes('secret body'), false);
});

Deno.test('ログ: 構造化ログをトレースに結びつけて OTLP logs で送る', async () => {
  const sent: Record<string, unknown>[] = [];
  const tracer = new Tracer({
    serviceName: 'save-chat',
    environment: 'test',
    licenseKey: 'k',
    send: (url, init) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return Promise.resolve(new Response('{}'));
    },
  });
  const span = tracer.startSpan('triage', { traceId: TRACE, spanId: SPAN });
  tracer.log('ERROR', 'triage.failed', span.context, {
    'error.code': 'triage_deadline',
    skip: undefined,
  });
  span.end();
  await tracer.flush();
  assertEquals(sent.map((s) => String(s.url).split('/v1/')[1]).sort(), ['logs', 'traces']);
  const logs = sent.find((s) => String(s.url).endsWith('/v1/logs'))!.body as {
    resourceLogs: { scopeLogs: { logRecords: Record<string, unknown>[] }[] }[];
  };
  const record = logs.resourceLogs[0]!.scopeLogs[0]!.logRecords[0]!;
  assertEquals(record.severityNumber, 17);
  assertEquals(record.severityText, 'ERROR');
  assertEquals(record.body, { stringValue: 'triage.failed' });
  assertEquals(record.traceId, TRACE);
  assertEquals(record.spanId, span.context.spanId);
  assertEquals(record.attributes, [
    { key: 'event', value: { stringValue: 'triage.failed' } },
    { key: 'error.code', value: { stringValue: 'triage_deadline' } },
  ]);
});

Deno.test('ログ: トレースとログは別々に送り、片方が失敗してももう片方は届く', async () => {
  const delivered: string[] = [];
  const tracer = new Tracer({
    serviceName: 't',
    environment: 'test',
    licenseKey: 'k',
    send: (url) => {
      if (url.endsWith('/v1/traces')) return Promise.reject(new TypeError('traces down'));
      delivered.push(url);
      return Promise.resolve(new Response('{}'));
    },
  });
  tracer.startSpan('s', null).end();
  tracer.log('INFO', 'x', null);
  await tracer.flush();
  assertEquals(delivered.length, 1);
  assertEquals(delivered[0]!.endsWith('/v1/logs'), true);
});
