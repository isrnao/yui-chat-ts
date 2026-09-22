// Spike の比較用: OTel を読み込まない同じ形の関数
const moduleReadyMs = performance.now();
const workerId = crypto.randomUUID().slice(0, 8);
let requestCount = 0;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  requestCount += 1;
  await new Promise((r) => setTimeout(r, 40));
  return Response.json(
    { worker: { workerId, moduleReadyMs, requestCount } },
    { headers: { 'Access-Control-Allow-Origin': '*' } }
  );
});
