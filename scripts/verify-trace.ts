// 本番（または任意の環境）のトレースを New Relic から取り出し、親子関係が期待どおりかを判定する。
// spec observability-new-relic Task 4 / Requirement 8。
//
// 使い方:
//   node --experimental-strip-types --env-file=.env scripts/verify-trace.ts --trace <traceId> --expect normal
//   node --experimental-strip-types --env-file=.env scripts/verify-trace.ts --trace <traceId> --expect admin --parent <spanId>
//   node --experimental-strip-types --env-file=.env scripts/verify-trace.ts --operation <operationId>
//
// 必要な環境変数: NEW_RELIC_USER_API_KEY（User キー）, VITE_NEW_RELIC_ACCOUNT_ID
// 終了コード: 0 = 合格, 1 = 不合格, 2 = 使い方の誤り
//
// 期待する木:
//   normal: POST save-chat ─ db insert chats
//   admin : POST save-chat ─┬─ db insert chats
//                           └─ triage ─ POST /api/v1/evaluate（save-chat）
//                                        └─ POST /api/v1/evaluate（okiraku-api）─ evaluation.run

import process from 'node:process';

interface Span {
  id: string;
  'parent.id'?: string | null;
  'trace.id': string;
  name: string;
  'service.name': string;
  'otel.status_code'?: string | null;
  'error.code'?: string | null;
  'http.response.status_code'?: number | null;
  'duration.ms'?: number;
  'chat.operation.id'?: string | null;
  'chat.attempt'?: number | null;
  'triage.outcome'?: string | null;
  'gen_ai.usage.input_tokens'?: number | null;
  'gen_ai.usage.output_tokens'?: number | null;
  'okiraku.traceparent_received'?: string | null;
}

interface Expected {
  name: string;
  service: string;
  children?: Expected[];
}

const EXPECTED: Record<string, Expected> = {
  normal: {
    name: 'POST save-chat',
    service: 'save-chat',
    children: [{ name: 'db insert chats', service: 'save-chat' }],
  },
  admin: {
    name: 'POST save-chat',
    service: 'save-chat',
    children: [
      { name: 'db insert chats', service: 'save-chat' },
      {
        name: 'triage',
        service: 'save-chat',
        children: [
          {
            name: 'POST /api/v1/evaluate',
            service: 'save-chat',
            children: [
              {
                name: 'POST /api/v1/evaluate',
                service: 'okiraku-api',
                children: [{ name: 'evaluation.run', service: 'okiraku-api' }],
              },
            ],
          },
        ],
      },
    ],
  },
};

const FIELDS = [
  'id',
  'parent.id',
  'trace.id',
  'name',
  'service.name',
  'otel.status_code',
  'error.code',
  'http.response.status_code',
  'duration.ms',
  'chat.operation.id',
  'chat.attempt',
  'triage.outcome',
  'gen_ai.usage.input_tokens',
  'gen_ai.usage.output_tokens',
  'okiraku.traceparent_received',
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function nrql(query: string): Promise<Span[]> {
  const key = process.env.NEW_RELIC_USER_API_KEY;
  const account = Number(process.env.VITE_NEW_RELIC_ACCOUNT_ID);
  if (!key || !account)
    throw new Error('NEW_RELIC_USER_API_KEY と VITE_NEW_RELIC_ACCOUNT_ID が必要です');
  const res = await fetch('https://api.newrelic.com/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'API-Key': key },
    body: JSON.stringify({
      query: `{ actor { account(id: ${account}) { nrql(query: ${JSON.stringify(query)}) { results } } } }`,
    }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data.actor.account.nrql.results as Span[];
}

const select = FIELDS.map((f) => (f.includes('.') ? `\`${f}\`` : f)).join(', ');

async function fetchUntil(query: string, ready: (spans: Span[]) => boolean, waitSec: number) {
  const deadline = Date.now() + waitSec * 1000;
  for (;;) {
    const spans = await nrql(query);
    if (ready(spans) || Date.now() > deadline) return spans;
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 15_000));
  }
}

function countNodes(e: Expected): number {
  return 1 + (e.children ?? []).reduce((n, c) => n + countNodes(c), 0);
}

function describe(s: Span): string {
  const parts = [
    s['service.name'],
    s['duration.ms'] !== undefined ? `${Math.round(s['duration.ms'])}ms` : undefined,
    s['http.response.status_code'] ? `http=${s['http.response.status_code']}` : undefined,
    s['otel.status_code'] === 'ERROR' ? `ERROR(${s['error.code'] ?? '?'})` : undefined,
    s['triage.outcome'] ? `outcome=${s['triage.outcome']}` : undefined,
    s['gen_ai.usage.input_tokens'] != null
      ? `tokens=${s['gen_ai.usage.input_tokens']}/${s['gen_ai.usage.output_tokens']}`
      : undefined,
  ];
  return parts.filter(Boolean).join(' ');
}

function printTree(spans: Span[], node: Span, depth = 0) {
  console.log(`${'  '.repeat(depth)}- ${node.name}  [${describe(node)}]`);
  for (const child of spans.filter((s) => s['parent.id'] === node.id)) {
    printTree(spans, child, depth + 1);
  }
}

/** 期待する木と照合し、見つからない・余分・エラーを列挙する */
function match(spans: Span[], expected: Expected, actual: Span, path: string, problems: string[]) {
  if (actual['otel.status_code'] === 'ERROR') {
    problems.push(`${path}: ERROR（error.code=${actual['error.code'] ?? '?'}）`);
  }
  const children = spans.filter((s) => s['parent.id'] === actual.id);
  const used = new Set<string>();
  for (const want of expected.children ?? []) {
    const found = children.find(
      (c) => !used.has(c.id) && c.name === want.name && c['service.name'] === want.service
    );
    const childPath = `${path} > ${want.name}（${want.service}）`;
    if (!found) {
      problems.push(`${childPath}: 見つからない`);
      continue;
    }
    used.add(found.id);
    match(spans, want, found, childPath, problems);
  }
}

async function verifyTrace(traceId: string, kind: string, parent: string | undefined) {
  const expected = EXPECTED[kind];
  if (!expected) {
    console.error(`--expect は ${Object.keys(EXPECTED).join(' / ')} のどれか`);
    process.exit(2);
  }
  const want = countNodes(expected);
  const query = `SELECT ${select} FROM Span WHERE trace.id = '${traceId}' SINCE 1 day ago LIMIT 100`;
  process.stdout.write(`trace ${traceId} を取得中（期待 ${want} スパン）`);
  const spans = await fetchUntil(query, (s) => s.length >= want, Number(arg('wait') ?? 180));
  console.log(` ${spans.length} スパン\n`);

  const ids = new Set(spans.map((s) => s.id));
  const roots = spans.filter((s) => !s['parent.id'] || !ids.has(s['parent.id']));
  for (const root of roots) printTree(spans, root);
  console.log('');

  const problems: string[] = [];
  if (roots.length !== 1) problems.push(`ルートが ${roots.length} 個（1 個であるべき）`);
  const root = roots.find(
    (r) => r.name === expected.name && r['service.name'] === expected.service
  );
  if (!root) {
    problems.push(`ルート ${expected.name}（${expected.service}）が見つからない`);
  } else {
    if (parent && root['parent.id'] !== parent) {
      problems.push(`ルートの親が ${root['parent.id'] ?? 'なし'}（期待 ${parent}）`);
    }
    match(spans, expected, root, expected.name, problems);
  }
  if (spans.length > want) problems.push(`余分なスパンが ${spans.length - want} 個`);

  const received = spans.find((s) => s['okiraku.traceparent_received']);
  if (received)
    console.log(
      `okiraku-api が受け取った traceparent: ${received['okiraku.traceparent_received']}`
    );

  if (problems.length) {
    console.log('✖ 不合格');
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  console.log('✔ 合格: 期待する木と一致（全スパンが同じ trace、親子関係・サービス・エラーなし）');
}

async function verifyOperation(operationId: string) {
  const query = `SELECT ${select} FROM Span WHERE \`chat.operation.id\` = '${operationId}' SINCE 1 day ago LIMIT 100`;
  process.stdout.write(`operation ${operationId} を取得中`);
  const spans = await fetchUntil(query, (s) => s.length > 0, Number(arg('wait') ?? 180));
  console.log(` ${spans.length} スパン\n`);
  const saves = spans
    .filter((s) => s.name === 'db insert chats')
    .sort((a, b) => (a['chat.attempt'] ?? 0) - (b['chat.attempt'] ?? 0));
  for (const s of saves) {
    const result = s['otel.status_code'] === 'ERROR' ? `失敗（${s['error.code']}）` : '成功';
    console.log(`  attempt ${s['chat.attempt'] ?? '?'}: ${result}  trace=${s['trace.id']}`);
  }
  const traces = new Set(saves.map((s) => s['trace.id']));
  const succeeded = saves.filter((s) => s['otel.status_code'] !== 'ERROR').length;
  console.log(
    `\n試行 ${saves.length} 回 / トレース ${traces.size} 本 / 成功した保存 ${succeeded} 件`
  );
  if (succeeded > 1)
    console.log('⚠ 同じ操作で 2 件以上保存されている（重複保存。既知の問題「冪等ではない」）');
  process.exit(saves.length > 0 ? 0 : 1);
}

const trace = arg('trace');
const operation = arg('operation');
if (trace) await verifyTrace(trace, arg('expect') ?? 'normal', arg('parent'));
else if (operation) await verifyOperation(operation);
else {
  console.error(
    '--trace <traceId> --expect normal|admin [--parent <spanId>] か --operation <id> を指定'
  );
  process.exit(2);
}
