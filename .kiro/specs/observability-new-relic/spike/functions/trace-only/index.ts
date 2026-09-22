import { BasicTracerProvider, BatchSpanProcessor } from 'npm:@opentelemetry/sdk-trace-base@2.11.0';
import { OTLPTraceExporter } from 'npm:@opentelemetry/exporter-trace-otlp-http@0.222.0';
const p = new BasicTracerProvider({ spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: 'http://host.docker.internal:4318/v1/traces' }))] });
Deno.serve(async () => { p.getTracer('x').startSpan('a').end(); await new Promise((r) => setTimeout(r, 40)); return Response.json({ ok: true }); });
