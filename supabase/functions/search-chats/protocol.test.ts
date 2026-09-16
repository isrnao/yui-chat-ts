import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInput,
  readCursor,
  signCursor,
  hmac,
  toItem,
  DAY,
  type SearchInput,
  type Cursor,
} from './protocol.ts';
import { buildSearchQuery } from './queries.ts';
import { checkRateLimit } from './rateLimit.ts';
const rooms = new Set(['superbeginner']);
const raw = { mode: 'search', roomId: 'superbeginner', q: '京都 旅行', rangeDays: 30, limit: 20 };
const input = parseInput(raw, rooms) as SearchInput;
const secret = 'test-only-signing-key-32-characters-long';
const now = 1_800_000_000_000;
const last = '01993200-0000-7000-8000-000000000001';
async function cursor(): Promise<Cursor> {
  return {
    v: 1,
    roomId: input.roomId,
    digest: await hmac(JSON.stringify(input.terms), secret),
    from: now - 30 * DAY,
    to: now,
    last,
    expires: now + 900_000,
    rangeDays: 30,
  };
}
test('日本語の複数語とUnicode文字数を検証する', () => {
  assert.deepEqual(input.terms, ['京都', '旅行']);
  assert.equal((parseInput({ ...raw, q: '😀😀' }, rooms) as SearchInput).terms.length, 1);
});
for (const change of [
  { q: '京' },
  { q: 'a'.repeat(81) },
  { q: 'ab cd ef gh ij kl' },
  { q: '\u0000ab' },
  { roomId: 'all' },
  { roomId: 'unknown' },
  { rangeDays: 365 },
  { limit: 500 },
  { limit: -1 },
  { mode: 'context', targetUuid: 'invalid' },
]) {
  test(`不正な入力を拒否する: ${JSON.stringify(change)}`, () =>
    assert.throws(() => parseInput({ ...raw, ...change }, rooms)));
}
test('署名済みカーソルを同じ条件で再利用できる', async () => {
  const value = await cursor();
  assert.deepEqual(await readCursor(await signCursor(value, secret), input, secret, now), value);
});
test('改ざん・別の検索語・期限切れのカーソルを拒否する', async () => {
  const token = await signCursor(await cursor(), secret);
  await assert.rejects(() => readCursor(token + 'a', input, secret, now));
  await assert.rejects(() => readCursor(token, { ...input, terms: ['東京'] }, secret, now));
  await assert.rejects(() => readCursor(token, { ...input, roomId: 'other' }, secret, now));
  await assert.rejects(() => readCursor(token, input, secret, now + 900_001));
});
test('AND語数とページングに応じてプレースホルダーをずらす', () => {
  assert.match(
    buildSearchQuery('extensions', 2, true),
    /OPERATOR\("extensions"\.&@\) \$4 AND message OPERATOR\("extensions"\.&@\) \$5/
  );
  assert.match(buildSearchQuery('public', 5, true), /uuid < \$9::uuid[\s\S]*LIMIT \$10/);
  assert.match(buildSearchQuery('public', 1, false), /LIMIT \$5/);
  assert.throws(() => buildSearchQuery('public; DROP TABLE chats', 1, false));
});
test('DTOで列を明示選択する', () => {
  const row = {
    uuid: last,
    room_id: 'superbeginner',
    name: '匿名',
    time: '123',
    excerpt: '京都',
    ip: 'secret',
  };
  assert.deepEqual(Object.keys(toItem(row)), ['uuid', 'roomId', 'name', 'time', 'excerpt']);
});
test('共有リミッター障害を許可として扱わない', async () => {
  for (const body of [{ error: 'unavailable' }, {}, { result: 2 }]) {
    await assert.rejects(
      () =>
        checkRateLimit('https://example.invalid', 'test', 'hashed-key', (async () =>
          Response.json(body)) as typeof fetch),
      { status: 503 }
    );
  }
  await assert.rejects(
    () =>
      checkRateLimit('https://example.invalid', 'test', 'key', (async () =>
        Response.json({ result: 0 })) as typeof fetch),
    { status: 429 }
  );
});
