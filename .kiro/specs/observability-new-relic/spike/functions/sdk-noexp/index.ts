import { trace } from 'npm:@opentelemetry/api@1.9.1';
import { BasicTracerProvider, AlwaysOnSampler } from 'npm:@opentelemetry/sdk-trace-base@2.11.0';
const p = new BasicTracerProvider({ sampler: new AlwaysOnSampler() });
Deno.serve(async () => { p.getTracer('x').startSpan('a').end(); await new Promise((r) => setTimeout(r, 40)); return Response.json({ ok: true }); });
