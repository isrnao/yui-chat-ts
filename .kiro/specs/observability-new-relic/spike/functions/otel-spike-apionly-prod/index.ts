// Spike: @opentelemetry/api だけを読み込み、OTLP/HTTP JSON を fetch で自前送信する構成のコスト見積もり
import { trace, ROOT_CONTEXT } from 'npm:@opentelemetry/api@1.9.1';
const moduleReadyMs = performance.now();
const workerId = crypto.randomUUID().slice(0, 8);
let requestCount = 0;
Deno.serve(async () => {
  requestCount += 1;
  trace.getSpan(ROOT_CONTEXT);
  await new Promise((r) => setTimeout(r, 40));
  return Response.json({ worker: { workerId, moduleReadyMs, requestCount } });
});
