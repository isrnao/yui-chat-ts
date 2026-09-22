import fs from 'node:fs';
const lines = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const spans = [], logs = [];
for (const l of lines) {
  const b = JSON.parse(l.body);
  for (const rs of b.resourceSpans ?? []) for (const ss of rs.scopeSpans) for (const s of ss.spans) {
    const a = Object.fromEntries(s.attributes.map((x) => [x.key, Object.values(x.value)[0]]));
    spans.push({ batchAt: l.t, name: s.name, traceId: s.traceId, spanId: s.spanId, parent: s.parentSpanId ?? '', id: a['req.id'], flags: s.flags, tp: a['injected.traceparent'] });
  }
  for (const rl of b.resourceLogs ?? []) for (const sl of rl.scopeLogs) for (const r of sl.logRecords) {
    const a = Object.fromEntries(r.attributes.map((x) => [x.key, Object.values(x.value)[0]]));
    logs.push({ body: r.body?.stringValue, traceId: r.traceId, spanId: r.spanId, id: a['req.id'] });
  }
}
console.log(`requests(batches)=${lines.length} paths=${[...new Set(lines.map((l) => l.path))]}`);
console.table(spans);
if (logs.length) console.table(logs);
// 検証: 同じ req.id のスパンがすべて同じ trace、親子が成立、別 req と混ざらない
const byId = Object.groupBy(spans, (s) => s.id);
for (const [id, ss] of Object.entries(byId)) {
  const traces = new Set(ss.map((s) => s.traceId));
  const ids = new Set(ss.map((s) => s.spanId));
  const server = ss.find((s) => s.name === 'POST save-chat');
  const triage = ss.find((s) => s.name === 'triage');
  const ev = ss.find((s) => s.name === 'evaluate.call');
  const ok = traces.size === 1 && (!triage || triage.parent === server?.spanId) && (!ev || ev.parent === triage?.spanId) && ss.every((s) => s === server || ids.has(s.parent));
  const foreign = spans.filter((s) => s.id !== id && traces.has(s.traceId)).length;
  console.log(`${id}: spans=${ss.length} oneTrace=${traces.size === 1} tree=${ok} foreign=${foreign}`);
}
