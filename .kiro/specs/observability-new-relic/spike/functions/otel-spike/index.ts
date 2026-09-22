// Spike: Supabase Edge Runtime 上で OTel SDK / Context / waitUntil flush が動くかを確かめる
const t0 = performance.now();
import { context, propagation, trace, ROOT_CONTEXT, SpanKind, type Context } from 'npm:@opentelemetry/api@1.9.1';
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

const endpoint = Deno.env.get('OTEL_EXPORTER_OTLP_ENDPOINT') ?? 'http://host.docker.internal:4318';
const resource = resourceFromAttributes({ 'service.name': 'otel-spike', 'deployment.environment.name': 'local' });
// New Relic へ送る場合だけ api-key を付ける（ローカルの sink には不要）
const licenseKey = Deno.env.get('NEW_RELIC_LICENSE_KEY');
const headers = licenseKey ? { 'api-key': licenseKey } : undefined;
const useAls = Deno.env.get('SPIKE_ALS') === '1';

let initError: string | null = null;
let tracerProvider: BasicTracerProvider | null = null;
let loggerProvider: LoggerProvider | null = null;
try {
  if (useAls) context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  tracerProvider = new BasicTracerProvider({
    resource,
    sampler: new AlwaysOnSampler(),
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces`, headers }))],
  });
  trace.setGlobalTracerProvider(tracerProvider);
  loggerProvider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: `${endpoint}/v1/logs`, headers }) })],
  });
} catch (e) {
  initError = String(e);
}
const initMs = performance.now() - t0;
const tracer = trace.getTracer('spike');
const logger = loggerProvider?.getLogger('spike');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
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
    const child = tracer.startSpan('evaluate.call', { kind: SpanKind.CLIENT, attributes: { 'req.id': id } }, tctx);
    const headers: Record<string, string> = {};
    propagation.inject(trace.setSpan(tctx, child), headers);
    await sleep(30 + Math.random() * 60);
    child.setAttribute('injected.traceparent', headers.traceparent ?? 'none');
    child.end();
    logger?.emit({ severityNumber: 9, severityText: "INFO", body: 'triage done', attributes: { 'req.id': id }, context: tctx });
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

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? crypto.randomUUID();
  const mode = url.searchParams.get('mode') ?? 'explicit';
  if (initError || !tracerProvider) return Response.json({ initError, initMs }, { status: 500 });

  const parent = propagation.extract(ROOT_CONTEXT, Object.fromEntries(req.headers));
  const server = tracer.startSpan('POST save-chat', { kind: SpanKind.SERVER, attributes: { 'req.id': id } }, parent);
  const ctx = trace.setSpan(parent, server);
  let res: Response;
  try {
    const db = tracer.startSpan('db insert chats', { kind: SpanKind.CLIENT, attributes: { 'req.id': id } }, ctx);
    await sleep(20 + Math.random() * 40);
    db.end();
    res = Response.json({
      id,
      mode,
      initMs,
      traceId: server.spanContext().traceId,
      serverSpanId: server.spanContext().spanId,
      activeInHandler: trace.getSpan(context.active())?.spanContext().spanId ?? null,
    });
  } finally {
    server.end();
    EdgeRuntime.waitUntil(flushAll(`response ${id}`));
  }
  if (mode === 'explicit') EdgeRuntime.waitUntil(triageExplicit(ctx, id));
  else if (mode === 'implicit') EdgeRuntime.waitUntil(context.with(ctx, () => triageImplicit(id)));
  else if (mode === 'hang') EdgeRuntime.waitUntil(new Promise(() => {})); // triage が終わらない場合
  return res;
});
