#!/usr/bin/env bash
# save-chat を Supabase Edge Runtime（Docker）で起動し、デプロイ前に最低限の応答を確かめる。
#
# Deno CLI と Edge Runtime は API の有無が違う（例: performance.timeOrigin は Edge Runtime で
# 未定義）。`deno test` が通っても本番で起動時に落ちることがあるため、デプロイ前に必ず実行する
# （2026-09-22 の save-chat 障害の再発防止）。
#
# 使い方: bash scripts/smoke-save-chat-edge.sh
# 前提: Docker が起動していること。DB には接続しない（400 / OPTIONS だけを確かめる）。
set -euo pipefail

IMAGE="${EDGE_RUNTIME_IMAGE:-public.ecr.aws/supabase/edge-runtime:v1.68.0}"
PORT="${SMOKE_PORT:-9299}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
NAME="save-chat-smoke-$$"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

mkdir -p "$WORK/main" "$WORK/functions/save-chat"
cp "$ROOT"/supabase/functions/save-chat/*.ts "$ROOT"/supabase/functions/save-chat/deno.json \
  "$WORK/functions/save-chat/"
rm -f "$WORK"/functions/save-chat/*.test.ts
cat > "$WORK/main/index.ts" <<'EOF'
Deno.serve(async (req: Request) => {
  const worker = await EdgeRuntime.userWorkers.create({
    servicePath: '/home/deno/functions/save-chat',
    memoryLimitMb: 150,
    workerTimeoutMs: 60_000,
    noModuleCache: false,
    importMapPath: '/home/deno/functions/save-chat/deno.json',
    envVars: Object.entries(Deno.env.toObject()),
    forceCreate: true,
    cpuTimeSoftLimitMs: 10_000,
    cpuTimeHardLimitMs: 20_000,
  });
  return await worker.fetch(req);
});
EOF

# NEW_RELIC_LICENSE_KEY は渡さない。スパンの作成・終了（時刻の計算を含む）はキーの有無に関係なく
# 必ず通るので、今回の障害の経路はこれで確かめられる。送信は行わない。
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
  -H 'traceparent: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01' \
  -d '{"room_id":"main","name":"","message":"smoke"}' -w '|%{http_code}')
[[ "$body" == '{"error":"name is required"}|400' ]] || fail "POST (name 空) の応答が想定外: $body"
echo "✔ POST (name 空) → 400"

allow=$(curl -s -D - -o /dev/null -X OPTIONS "http://localhost:$PORT" \
  -H 'Access-Control-Request-Headers: traceparent,x-chat-operation-id' |
  tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-headers"{print $2}')
[[ "$allow" == 'traceparent,x-chat-operation-id' ]] || fail "OPTIONS の許可ヘッダーが想定外: $allow"
echo "✔ OPTIONS → traceparent を許可"

if docker logs "$NAME" 2>&1 | grep -q '\[Error\]'; then
  fail 'Edge Runtime のログにエラーがある'
fi
echo "✔ Edge Runtime のログにエラーなし"
