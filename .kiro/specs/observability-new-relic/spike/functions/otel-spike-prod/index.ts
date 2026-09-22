// Spike: Supabase Edge Runtime 上で OTel SDK / Context / waitUntil flush が動くかを確かめる
const t0 = performance.now();
import {
  context,
  propagation,
  trace,
  ROOT_CONTEXT,
  SpanKind,
  defaultTextMapGetter,
  defaultTextMapSetter,
  type Context,
} from 'npm:@opentelemetry/api@1.9.1';
import { AsyncLocalStorageContextManager } from 'npm:@opentelemetry/context-async-hooks@2.11.0';
import { W3CTraceContextPropagator } from 'npm:@opentelemetry/core@2.11.0';
import { resourceFromAttributes } from 'npm:@opentelemetry/resources@2.11.0';
import {
  AlwaysOnSampler,
  BasicTracerProvider,
  BatchSpanProcessor,
} from 'npm:@opentelemetry/sdk-trace-base@2.11.0';
import { OTLPTraceExporter } from 'npm:@opentelemetry/exporter-trace-otlp-http@0.222.0';
import { LoggerProvider, BatchLogRecordProcessor } from 'npm:@opentelemetry/sdk-logs@0.222.0';
import { OTLPLogExporter } from 'npm:@opentelemetry/exporter-logs-otlp-http@0.222.0';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const endpoint = Deno.env.get('OTEL_EXPORTER_OTLP_ENDPOINT') ?? 'https://otlp.nr-data.net';
const resource = resourceFromAttributes({
  'service.name': 'otel-spike',
  'deployment.environment.name': 'production-spike',
});
// New Relic へ送る場合だけ api-key を付ける（ローカルの sink には不要）
const licenseKey = Deno.env.get('NEW_RELIC_LICENSE_KEY');
const headers = licenseKey ? { 'api-key': licenseKey } : undefined;
const useAls = Deno.env.get('SPIKE_ALS') === '1';

let initError: string | null = null;
let tracerProvider: BasicTracerProvider | null = null;
let loggerProvider: LoggerProvider | null = null;
// 本番の Edge Runtime が OTel のグローバルを先に登録しているかを調べる
const preExisting = {
  tracerProvider: (trace.getTracerProvider() as { constructor?: { name?: string } })?.constructor
    ?.name,
  delegate: (
    trace.getTracerProvider() as { getDelegate?: () => { constructor?: { name?: string } } }
  ).getDelegate?.()?.constructor?.name,
  propagatorFields: propagation.fields(),
  activeSpanAtInit: trace.getSpan(context.active())?.spanContext().spanId ?? null,
};
const registered: Record<string, boolean> = {};
// エクスポーターの結果を記録する（本番でスパンが届かない原因調査用）
const exportLog: { at: number; kind: string; count: number; code: number; error?: string }[] = [];
type AnyExporter = {
  export(items: unknown[], cb: (r: { code: number; error?: Error }) => void): void;
  shutdown(): Promise<void>;
  forceFlush?(): Promise<void>;
};
function recording<T extends AnyExporter>(kind: string, inner: T): T {
  return {
    export(items, cb) {
      inner.export(items, (r) => {
        exportLog.push({
          at: Date.now(),
          kind,
          count: items.length,
          code: r.code,
          error: r.error ? String(r.error).slice(0, 300) : undefined,
        });
        if (exportLog.length > 50) exportLog.shift();
        cb(r);
      });
    },
    shutdown: () => inner.shutdown(),
    forceFlush: () => inner.forceFlush?.() ?? Promise.resolve(),
  } as T;
}
const w3c = new W3CTraceContextPropagator();
try {
  if (useAls)
    registered.contextManager = context.setGlobalContextManager(
      new AsyncLocalStorageContextManager().enable()
    );
  registered.propagator = propagation.setGlobalPropagator(w3c);
  tracerProvider = new BasicTracerProvider({
    resource,
    sampler: new AlwaysOnSampler(),
    spanProcessors: [
      new BatchSpanProcessor(
        recording('traces', new OTLPTraceExporter({ url: `${endpoint}/v1/traces`, headers }))
      ),
    ],
  });
  registered.tracerProvider = trace.setGlobalTracerProvider(tracerProvider);
  loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor({
        exporter: recording('logs', new OTLPLogExporter({ url: `${endpoint}/v1/logs`, headers })),
      }),
    ],
  });
} catch (e) {
  initError = String(e);
}
const initMs = performance.now() - t0;
// グローバルの登録に頼らず、自前の provider から直接 tracer を取る
const tracer =
  Deno.env.get('SPIKE_GLOBAL_TRACER') === '1'
    ? trace.getTracer('spike')
    : tracerProvider!.getTracer('spike');
const logger = loggerProvider?.getLogger('spike');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
async function flushAll(label: string) {
  const r = await Promise.allSettled([
    withTimeout(tracerProvider!.forceFlush(), 3000),
    withTimeout(loggerProvider!.forceFlush(), 3000),
  ]);
  console.log(`[spike] flush ${label}`, r.map((x) => x.status).join(','));
}

// 明示的に Context を渡す版
async function triageExplicit(ctx: Context, id: string) {
  const span = tracer.startSpan('triage', { attributes: { 'req.id': id } }, ctx);
  const tctx = trace.setSpan(ctx, span);
  try {
    await sleep(50 + Math.random() * 100);
    const child = tracer.startSpan(
      'evaluate.call',
      { kind: SpanKind.CLIENT, attributes: { 'req.id': id } },
      tctx
    );
    const headers: Record<string, string> = {};
    w3c.inject(trace.setSpan(tctx, child), headers, defaultTextMapSetter);
    await sleep(30 + Math.random() * 60);
    child.setAttribute('injected.traceparent', headers.traceparent ?? 'none');
    child.end();
    logger?.emit({
      severityNumber: 9,
      severityText: 'INFO',
      body: 'triage done',
      attributes: { 'req.id': id },
      context: tctx,
    });
  } finally {
    span.end();
    await flushAll(`triage ${id}`);
  }
}

// 暗黙の context.active() に頼る版（Context Manager の検証用）
async function triageImplicit(id: string) {
  const span = tracer.startSpan('triage', { attributes: { 'req.id': id } }); // 親は context.active()
  await sleep(50 + Math.random() * 100);
  const child = tracer.startSpan('evaluate.call', { attributes: { 'req.id': id } });
  await sleep(30);
  child.end();
  span.end();
  await flushAll(`triage-implicit ${id}`);
}

// コールドスタート計測用: ワーカーの時間原点からモジュール評価完了までの時間（import を含む）
const moduleReadyMs = performance.now();
const workerId = crypto.randomUUID().slice(0, 8);
let requestCount = 0;

function corsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      req.headers.get('access-control-request-headers') ??
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  requestCount += 1;
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? crypto.randomUUID();
  const mode = url.searchParams.get('mode') ?? 'explicit';
  const worker = { workerId, moduleReadyMs, requestCount };
  const received = {
    traceparent: req.headers.get('traceparent'),
    tracestate: req.headers.get('tracestate'),
    newrelic: req.headers.has('newrelic'),
  };
  if (initError || !tracerProvider)
    return Response.json({ initError, initMs, worker }, { status: 500, headers: cors });
  if (mode === 'status') return Response.json({ worker, exportLog }, { headers: cors });
  if (mode === 'sync') {
    // 応答前に同じワーカー内で送信まで済ませ、結果を返す
    const tid = w3c.extract(ROOT_CONTEXT, Object.fromEntries(req.headers), defaultTextMapGetter);
    const s = tracer.startSpan(
      'sync-check',
      { kind: SpanKind.SERVER, attributes: { 'req.id': id } },
      tid
    );
    s.end();
    logger?.emit({
      severityNumber: 9,
      severityText: 'INFO',
      body: 'sync-check',
      context: trace.setSpan(tid, s),
    });
    const t = performance.now();
    await flushAll(`sync ${id}`);
    return Response.json(
      { worker, traceId: s.spanContext().traceId, flushMs: performance.now() - t, exportLog },
      { headers: cors }
    );
  }

  const parent = w3c.extract(ROOT_CONTEXT, Object.fromEntries(req.headers), defaultTextMapGetter);
  const server = tracer.startSpan(
    'POST save-chat',
    { kind: SpanKind.SERVER, attributes: { 'req.id': id } },
    parent
  );
  const ctx = trace.setSpan(parent, server);
  let res: Response;
  try {
    const db = tracer.startSpan(
      'db insert chats',
      { kind: SpanKind.CLIENT, attributes: { 'req.id': id } },
      ctx
    );
    await sleep(20 + Math.random() * 40);
    db.end();
    res = Response.json(
      {
        id,
        mode,
        initMs,
        worker,
        received,
        preExisting,
        registered,
        traceId: server.spanContext().traceId,
        serverSpanId: server.spanContext().spanId,
        activeInHandler: trace.getSpan(context.active())?.spanContext().spanId ?? null,
      },
      { headers: cors }
    );
  } finally {
    server.end();
    EdgeRuntime.waitUntil(flushAll(`response ${id}`));
  }
  if (mode === 'explicit') EdgeRuntime.waitUntil(triageExplicit(ctx, id));
  else if (mode === 'implicit') EdgeRuntime.waitUntil(context.with(ctx, () => triageImplicit(id)));
  else if (mode === 'hang') EdgeRuntime.waitUntil(new Promise(() => {})); // triage が終わらない場合
  return res;
});
