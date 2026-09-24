// deno test --allow-env --allow-read supabase/functions/two-shot/
// 保存先（two_shot_commit）はメモリ上の偽物にする。SQL の原子性そのものは supabase/tests/two_shot.sql で確かめる。
import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1';
import {
  createHandler,
  createIpResolver,
  MAX_BODY_BYTES,
  parseToken,
  type CommitInput,
  type CommitResult,
  type HandlerDeps,
  type RoomRow,
  type TwoShotStore,
} from './handler.ts';
import { emptyRoomState, type AdmissionRecord } from './rules.ts';
import { Tracer, type FinishedSpan } from '../save-chat/telemetry.ts';

const T0 = Date.UTC(2026, 8, 24, 3, 0, 0);
const URL_ = 'https://example.test/functions/v1/two-shot';

function token(n: number, createdAt = T0): string {
  return `v1.${createdAt}.${String(n).padStart(43, 'A')}`;
}

/** two_shot_commit と同じ規則で振る舞うメモリ上の保存先 */
class FakeStore implements TwoShotStore {
  rooms = new Map<string, RoomRow>();
  admissions = new Map<string, AdmissionRecord>();
  audits: CommitInput['audit'][] = [];
  commits: CommitInput[] = [];
  /** 次の commit で返す値（空なら通常の処理） */
  forced: (CommitResult | 'throw')[] = [];
  /** loadRoom の前に 1 回だけ実行する（ほかの要求が先に保存した状態を作る） */
  beforeLoad: (() => void) | null = null;

  constructor() {
    for (let i = 1; i <= 10; i++) {
      this.rooms.set(String(i).padStart(2, '0'), { version: 0, state: emptyRoomState() });
    }
  }

  loadRoom(roomId: string): Promise<RoomRow | null> {
    const hook = this.beforeLoad;
    this.beforeLoad = null;
    hook?.();
    const row = this.rooms.get(roomId);
    return Promise.resolve(row ? structuredClone(row) : null);
  }

  loadAdmission(tokenHash: string): Promise<AdmissionRecord | null> {
    return Promise.resolve(this.admissions.get(tokenHash) ?? null);
  }

  commit(input: CommitInput): Promise<CommitResult> {
    this.commits.push(input);
    const forced = this.forced.shift();
    if (forced === 'throw') return Promise.reject(new Error('connection reset'));
    if (forced) return Promise.resolve(forced);
    const row = this.rooms.get(input.roomId)!;
    if (row.version !== input.expectedVersion) return Promise.resolve('conflict');
    if (input.admission) {
      if (this.admissions.has(input.admission.tokenHash))
        return Promise.resolve('admission-conflict');
      this.admissions.set(input.admission.tokenHash, {
        roomId: input.roomId,
        requestHash: input.admission.requestHash,
        memberId: input.admission.memberId,
        result: input.admission.result,
      });
    }
    if (input.nextState)
      this.rooms.set(input.roomId, {
        version: row.version + 1,
        state: structuredClone(input.nextState),
      });
    if (input.audit) this.audits.push(input.audit);
    return Promise.resolve('committed');
  }
}

function setup(overrides: Partial<HandlerDeps> = {}) {
  const store = new FakeStore();
  const sent: FinishedSpan[] = [];
  const tracer = new Tracer({
    serviceName: 'two-shot',
    environment: 'test',
    licenseKey: 'test-key',
    send: (_url, init) => {
      const body = JSON.parse(String(init.body));
      for (const rs of body.resourceSpans ?? []) {
        for (const ss of rs.scopeSpans) sent.push(...ss.spans);
      }
      return Promise.resolve(new Response('{}', { status: 202 }));
    },
  });
  let now = T0;
  let uuid = 0;
  const handler = createHandler({
    tracer,
    store: () => store,
    now: () => now,
    randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
    resolveIp: createIpResolver('x-real-ip'),
    ...overrides,
  });
  const call = async (
    body: unknown,
    opts: { token?: string; ip?: string; ua?: string; raw?: string } = {}
  ) => {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (opts.token) headers.set('x-two-shot-token', opts.token);
    headers.set('x-real-ip', opts.ip ?? '203.0.113.1');
    headers.set('user-agent', opts.ua ?? 'UA-A');
    const res = await handler(
      new Request(URL_, { method: 'POST', headers, body: opts.raw ?? JSON.stringify(body) })
    );
    return { res, json: await res.json().catch(() => null) };
  };
  return {
    store,
    sent,
    call,
    handler,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const enter = (name: string, extra: Record<string, unknown> = {}) => ({
  room: '01',
  op: 'enter',
  name,
  sex: 'M',
  profile: '',
  make: false,
  ...extra,
});

Deno.test('OPTIONS は CORS の許可を返し、全応答に no-store を付ける', async () => {
  const { handler } = setup();
  const res = await handler(
    new Request(URL_, {
      method: 'OPTIONS',
      headers: { 'access-control-request-headers': 'apikey, x-two-shot-token' },
    })
  );
  assertEquals(res.headers.get('access-control-allow-headers'), 'apikey, x-two-shot-token');
  assertEquals(res.headers.get('cache-control'), 'no-store');
  await res.body?.cancel();
});

Deno.test('POST 以外は 405', async () => {
  const { handler } = setup();
  const res = await handler(new Request(URL_, { method: 'GET' }));
  assertEquals(res.status, 405);
  assertEquals(res.headers.get('cache-control'), 'no-store');
  await res.body?.cancel();
});

Deno.test('不正な JSON・未知の部屋・未知の操作・長すぎる UA は 400', async () => {
  const { call } = setup();
  assertEquals((await call(null, { raw: '{' })).res.status, 400);
  assertEquals((await call({ room: '11', op: 'read' })).res.status, 400);
  assertEquals((await call({ room: '01', op: 'drop' })).res.status, 400);
  assertEquals((await call({ room: '01', op: 'read' }, { ua: 'x'.repeat(1025) })).res.status, 400);
  assertEquals(
    (await call({ room: '01', op: 'say', text: 'あ'.repeat(2501) }, { token: token(1) })).res
      .status,
    400
  );
});

Deno.test('64 KiB を超えるボディは 413', async () => {
  const { call } = setup();
  const { res } = await call(null, {
    raw: JSON.stringify({ room: '01', op: 'read', pad: 'x'.repeat(MAX_BODY_BYTES) }),
  });
  assertEquals(res.status, 413);
});

Deno.test('部屋を選ばずに入室すると E1（ページ全体）', async () => {
  const { call } = setup();
  const { res, json } = await call(enter('alice', { room: '' }), { token: token(1) });
  assertEquals(res.status, 200);
  assertEquals(json, { ok: false, notice: 'E1', placement: 'page' });
});

Deno.test('入室にはトークンが必要で、形式が違えば 400', async () => {
  const { call } = setup();
  assertEquals((await call(enter('alice'))).res.status, 400);
  assertEquals((await call(enter('alice'), { token: 'v1.abc.def' })).res.status, 400);
  assertEquals(parseToken('v1.1.' + 'A'.repeat(42)), 'invalid');
  assertEquals(parseToken(null), null);
});

Deno.test('入室すると部屋と入室記録を一緒に保存し、ログ画面の形を返す', async () => {
  const { call, store } = setup();
  const { res, json } = await call(enter('alice', { profile: 'hi' }), { token: token(1) });
  assertEquals(res.status, 200);
  assertEquals(json.ok, true);
  assertEquals(json.screen, 'room');
  assertEquals(json.room.seat, 0);
  assertEquals(json.room.me, { name: 'alice', sex: 'M' });
  assertEquals(
    json.room.lines.map((l: { code?: string }) => l.code),
    ['N4', 'N1']
  );
  assertEquals(store.commits.length, 1);
  assertEquals(store.commits[0].admission?.result, 'accepted');
  assertEquals(store.commits[0].admission?.attemptAtMs, T0);
  assertEquals(store.rooms.get('01')?.version, 1);
});

Deno.test('同じ試行の再送は、保存せずに同じ席を返す', async () => {
  const { call, store } = setup();
  await call(enter('alice'), { token: token(1) });
  const again = await call(enter('alice'), { token: token(1) });
  assertEquals(again.json.room.seat, 0);
  assertEquals(store.commits.length, 1);
  assertEquals(store.rooms.get('01')?.version, 1);
});

Deno.test('同じトークンを別の部屋に使うと 400', async () => {
  const { call } = setup();
  await call(enter('alice'), { token: token(1) });
  assertEquals((await call(enter('alice', { room: '02' }), { token: token(1) })).res.status, 400);
});

Deno.test('管制者と同じ IP と UA の入室は、部屋を変えずに E2 と記録', async () => {
  const { call, store } = setup();
  await call(enter('alice'), { token: token(1) });
  const { json } = await call(enter('bob'), { token: token(2) });
  assertEquals(json, { ok: false, notice: 'E2', placement: 'page' });
  assertEquals(store.rooms.get('01')?.version, 1);
  assertEquals(
    [...store.admissions.values()].map((a) => a.result),
    ['accepted', 'duplicate']
  );
});

Deno.test('信頼できる IP を設定していなければ、重複入室と判定しない', async () => {
  const { call } = setup({ resolveIp: createIpResolver(undefined) });
  await call(enter('alice'), { token: token(1) });
  const { json } = await call(enter('bob'), { token: token(2) });
  assertEquals(json.room.seat, 1);
});

Deno.test('IP の取り出しは設定したヘッダ（x-forwarded-for は末尾から数える）だけを信じる', () => {
  const req = (h: Record<string, string>) => new Request(URL_, { headers: h });
  const last = createIpResolver('x-forwarded-for:1');
  assertEquals(last(req({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9' })), '203.0.113.9');
  assertEquals(
    createIpResolver('x-forwarded-for:2')(req({ 'x-forwarded-for': '203.0.113.9' })),
    null
  );
  assertEquals(createIpResolver('x-real-ip')(req({ 'x-real-ip': 'not-an-ip' })), null);
  assertEquals(createIpResolver('x-real-ip')(req({ 'x-real-ip': '2001:db8::1' })), '2001:db8::1');
  assertEquals(createIpResolver('bad header!')(req({ 'x-real-ip': '1.1.1.1' })), null);
});

Deno.test('version が競合したら読み直して評価し直す', async () => {
  const { call, store } = setup();
  await call(enter('alice'), { token: token(1) });
  // 読んだ直後にほかの要求が保存した（version が進んだ）状態を作る
  store.forced.push('conflict');
  const { json } = await call({ room: '01', op: 'say', text: 'hi' }, { token: token(1) });
  assertEquals(json.room.lines[0].text, 'hi');
  assertEquals(store.commits.length, 3);
});

Deno.test('競合が 3 回続いたら 503', async () => {
  const { call, store } = setup();
  await call(enter('alice'), { token: token(1) });
  store.forced.push('conflict', 'conflict', 'conflict');
  const { res } = await call({ room: '01', op: 'say', text: 'hi' }, { token: token(1) });
  assertEquals(res.status, 503);
});

Deno.test('DB の例外は再試行せず 500', async () => {
  const { call, store } = setup();
  await call(enter('alice'), { token: token(1) });
  store.forced.push('throw');
  const { res } = await call({ room: '01', op: 'say', text: 'hi' }, { token: token(1) });
  assertEquals(res.status, 500);
  assertEquals(store.commits.length, 2);
});

Deno.test('受付期限を DB で過ぎていたら E4（ページ全体）', async () => {
  const { call, store } = setup();
  store.forced.push('expired-entry');
  const { json } = await call(enter('alice'), { token: token(1) });
  assertEquals(json, { ok: false, notice: 'E4', placement: 'page' });
});

Deno.test('入室記録だけが先に確定していたら、部屋を読み直してから判断する', async () => {
  const { call, store } = setup();
  await call(enter('alice'), { token: token(1) });
  const saved = structuredClone(store.rooms.get('01')!);
  // 1 回目の読み取りでは古い（席のない）部屋を見せ、読み直しで新しい部屋を見せる
  store.rooms.set('01', { version: 0, state: emptyRoomState() });
  store.beforeLoad = () => {
    store.beforeLoad = () => store.rooms.set('01', saved);
  };
  const { json } = await call(enter('alice'), { token: token(1) });
  assertEquals(json.room?.seat, 0);
});

Deno.test('トークンなしの更新は E3 で、何も保存しない', async () => {
  const { call, store } = setup();
  await call(enter('alice'), { token: token(1) });
  const { json } = await call({ room: '01', op: 'read' });
  assertEquals(json, { ok: false, notice: 'E3', placement: 'pane' });
  assertEquals(store.commits.length, 1);
});

Deno.test('時間切れの部屋は、トークンなしでも空室に戻したことだけを保存する', async () => {
  const { call, store, advance } = setup();
  await call(enter('alice'), { token: token(1) });
  advance(300_000);
  const { json } = await call({ room: '01', op: 'read' });
  assertEquals(json.notice, 'E3');
  assertEquals(store.commits.length, 2);
  assertEquals(store.commits[1].admission, null);
  assertEquals(store.rooms.get('01')?.state, emptyRoomState());
});

Deno.test('発言は会話の控えと一緒に保存する', async () => {
  const { call, store } = setup();
  await call(enter('alice'), { token: token(1) });
  await call({ room: '01', op: 'say', text: 'こんにちは' }, { token: token(1) });
  assertEquals(store.audits.length, 1);
  assertEquals(store.audits[0]?.text, 'こんにちは');
  assertEquals(store.audits[0]?.seat, 0);
  assertEquals(store.audits[0]?.ip, '203.0.113.1');
});

Deno.test(
  '応答にほかの人の IP・UA・トークンのハッシュを入れず、トレースにも本文やトークンを入れない',
  async () => {
    const { call, store, sent } = setup();
    await call(enter('alice', { profile: 'ひみつ' }), {
      token: token(1),
      ip: '203.0.113.1',
      ua: 'UA-SECRET-A',
    });
    const guest = await call(enter('bob'), {
      token: token(2),
      ip: '198.51.100.2',
      ua: 'UA-SECRET-B',
    });
    const text = JSON.stringify(guest.json);
    const hashes = [...store.admissions.keys()];
    for (const secret of [
      '203.0.113.1',
      '198.51.100.2',
      'UA-SECRET-A',
      'UA-SECRET-B',
      token(1),
      token(2),
      ...hashes,
    ]) {
      assertFalse(text.includes(secret), secret);
    }
    await call({ room: '01', op: 'say', text: 'ないしょ' }, { token: token(2) });
    const traced = JSON.stringify(sent);
    for (const secret of [
      'ないしょ',
      'ひみつ',
      'alice',
      token(1),
      '203.0.113.1',
      'UA-SECRET-A',
      ...hashes,
    ]) {
      assertFalse(traced.includes(secret), secret);
    }
    assert(traced.includes('two_shot.op'));
  }
);

Deno.test('環境変数が足りなければ 500', async () => {
  const { call } = setup({ store: () => null });
  const { res } = await call({ room: '01', op: 'read' });
  assertEquals(res.status, 500);
});

// ---------------------------------------------------------------------------
// 応答のフィクスチャ（design.md §7）。クライアントの protocol.ts のテストが同じファイルを読む。
// handler の出力と食い違ったら失敗する。意図して変えたときは
//   UPDATE_FIXTURES=1 deno test --allow-env --allow-read --allow-write supabase/functions/two-shot/
// で書き直す。
// ---------------------------------------------------------------------------

Deno.test('応答のフィクスチャが handler の出力と一致する', async () => {
  const { call, advance } = setup();
  await call(enter('alice', { sex: 'F', profile: 'よろしく' }), { token: token(1) });
  advance(1000);
  await call(enter('', { sex: '-', make: true }), { token: token(2), ip: '198.51.100.2' });
  advance(1000);
  await call({ room: '01', op: 'say', text: '&hearts; <b>hi</b>' }, { token: token(1) });
  advance(2500);
  const outputs: Record<string, unknown> = {
    room: (await call({ room: '01', op: 'read' }, { token: token(2) })).json,
    lobby: (await call(enter('carol'), { token: token(3), ip: '192.0.2.3' })).json,
    'page-notice': (await call(enter('dave', { room: '' }), { token: token(4) })).json,
    'pane-notice': (await call({ room: '01', op: 'read' })).json,
  };
  const dir = new URL('./fixtures/', import.meta.url);
  for (const [name, value] of Object.entries(outputs)) {
    const file = new URL(`${name}.json`, dir);
    const text = JSON.stringify(value, null, 2) + '\n';
    if (Deno.env.get('UPDATE_FIXTURES') === '1') {
      await Deno.mkdir(dir, { recursive: true });
      await Deno.writeTextFile(file, text);
    }
    assertEquals(await Deno.readTextFile(file), text, `fixtures/${name}.json`);
  }
});
