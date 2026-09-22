import { trace } from 'npm:@opentelemetry/api@1.9.1';
Deno.serve(async () => { trace.getTracer('x'); await new Promise((r) => setTimeout(r, 40)); return Response.json({ ok: true }); });
