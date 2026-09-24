#!/usr/bin/env bash
# two-shot を Supabase Edge Runtime（Docker）で起動し、デプロイ前に最低限の応答を確かめる。
# save-chat の scripts/smoke-save-chat-edge.sh と同じ理由（Deno CLI と Edge Runtime で API の有無が違う）。
#
# 使い方: bash scripts/smoke-two-shot-edge.sh
# 前提: Docker が起動していること。DB には接続しない（DB を使わない応答だけを確かめる）。
set -euo pipefail

IMAGE="${EDGE_RUNTIME_IMAGE:-public.ecr.aws/supabase/edge-runtime:v1.76.0}"
PORT="${SMOKE_PORT:-9298}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
NAME="two-shot-smoke-$$"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

# two-shot は save-chat の telemetry.ts を相対パスで読むので、同じ配置でコピーする
mkdir -p "$WORK/main" "$WORK/functions/two-shot" "$WORK/functions/save-chat"
cp "$ROOT"/supabase/functions/two-shot/*.ts "$ROOT"/supabase/functions/two-shot/deno.json \
  "$WORK/functions/two-shot/"
cp "$ROOT"/supabase/functions/save-chat/telemetry.ts "$WORK/functions/save-chat/"
rm -f "$WORK"/functions/two-shot/*.test.ts
cat > "$WORK/main/index.ts" <<'TS'
Deno.serve(async (req: Request) => {
  const worker = await EdgeRuntime.userWorkers.create({
    servicePath: '/home/deno/functions/two-shot',
    memoryLimitMb: 150,
    workerTimeoutMs: 60_000,
    noModuleCache: false,
    importMapPath: '/home/deno/functions/two-shot/deno.json',
    envVars: Object.entries(Deno.env.toObject()),
    forceCreate: true,
    cpuTimeSoftLimitMs: 10_000,
    cpuTimeHardLimitMs: 20_000,
  });
  return await worker.fetch(req);
});
TS

# 公開レジストリはレート制限（toomanyrequests）で一時的に取得できないことがあるので、間隔をあけて再試行する
for attempt in 1 2 3 4; do
  docker image inspect "$IMAGE" >/dev/null 2>&1 && break
  docker pull -q "$IMAGE" >/dev/null && break
  [[ $attempt == 4 ]] && { echo "✖ $IMAGE を取得できない"; exit 1; }
  sleep $((attempt * 15))
done

docker run -d --name "$NAME" -p "$PORT:9000" \
  -e SUPABASE_URL=https://example.invalid -e SUPABASE_SERVICE_ROLE_KEY=smoke \
  -e DEPLOYMENT_ENVIRONMENT=smoke \
  -v "$WORK/main:/home/deno/main" -v "$WORK/functions:/home/deno/functions" \
  "$IMAGE" start --main-service /home/deno/main >/dev/null

for _ in $(seq 1 60); do
  curl -s -o /dev/null "http://localhost:$PORT" && break
  sleep 1
done

fail() {
  echo "✖ $1"
  docker logs "$NAME" 2>&1 | tail -20
  exit 1
}

body=$(curl -s -X POST "http://localhost:$PORT" -H 'content-type: application/json' \
  -d '{"room":"99","op":"read"}' -w '|%{http_code}')
[[ "$body" == '{"error":"unknown room"}|400' ]] || fail "POST (未知の部屋) の応答が想定外: $body"
echo "✔ POST (未知の部屋) → 400"

# 部屋を選ばずに入室（E1）は DB を使わずに rules.ts の定数と応答の組み立てまで通る
body=$(curl -s -X POST "http://localhost:$PORT" -H 'content-type: application/json' \
  -H 'traceparent: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01' \
  -d '{"room":"","op":"enter","name":"a","sex":"M","profile":"","make":false}' -w '|%{http_code}')
[[ "$body" == '{"ok":false,"notice":"E1","placement":"page"}|200' ]] || fail "POST (部屋なし) の応答が想定外: $body"
echo "✔ POST (部屋なし) → E1"

headers=$(curl -s -D - -o /dev/null -X OPTIONS "http://localhost:$PORT" \
  -H 'Access-Control-Request-Headers: apikey,x-two-shot-token' | tr -d '\r')
allow=$(awk -F': ' 'tolower($1)=="access-control-allow-headers"{print $2}' <<<"$headers")
cache=$(awk -F': ' 'tolower($1)=="cache-control"{print $2}' <<<"$headers")
[[ "$allow" == 'apikey,x-two-shot-token' ]] || fail "OPTIONS の許可ヘッダーが想定外: $allow"
[[ "$cache" == 'no-store' ]] || fail "Cache-Control が想定外: $cache"
echo "✔ OPTIONS → x-two-shot-token を許可、no-store"

if docker logs "$NAME" 2>&1 | grep -q '\[Error\]'; then
  fail 'Edge Runtime のログにエラーがある'
fi
echo "✔ Edge Runtime のログにエラーなし"
