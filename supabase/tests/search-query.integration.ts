import process from 'node:process';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { buildSearchQuery, CONTEXT_QUERY } from '../functions/search-chats/queries.ts';

// Explicit opt-in; no fallback to any Supabase/project URL.
const url = process.env.CHAT_SEARCH_TEST_DATABASE_URL;
if (!url) throw new Error('Use a disposable DB via CHAT_SEARCH_TEST_DATABASE_URL');
const sql = postgres(url, { max: 1 });
try {
  await sql.begin(async (tx) => {
    const now = Date.now();
    for (let i = 1; i <= 4; i++) {
      await tx`INSERT INTO public.chats (uuid, room_id, name, color, message, time, deleted)
        VALUES (${'01993200-0000-7000-8000-00000000000' + i}, 'superbeginner', 'fixture', '#000000',
          ${i === 4 ? '東京観光' : '京都の旅行計画'}, ${now - 1000}, ${i === 2})`;
    }
    await tx`SET LOCAL ROLE chat_search_reader`;
    const [extension] =
      await tx`SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgroonga'`;
    const first = await tx.unsafe(buildSearchQuery(extension.nspname, 2, false), [
      'superbeginner',
      now - 86400000,
      now,
      '京都',
      '旅行',
      1,
    ]);
    assert.equal(first.length, 1);
    assert.equal(first[0].uuid, '01993200-0000-7000-8000-000000000003');
    const next = await tx.unsafe(buildSearchQuery(extension.nspname, 2, true), [
      'superbeginner',
      now - 86400000,
      now,
      '京都',
      '旅行',
      first[0].uuid,
      21,
    ]);
    assert.equal(next.length, 1);
    assert.equal(next[0].uuid, '01993200-0000-7000-8000-000000000001');
    const hidden = await tx.unsafe(CONTEXT_QUERY, [
      'superbeginner',
      '01993200-0000-7000-8000-000000000002',
      now - 86400000,
      now,
    ]);
    assert.equal(hidden.length, 0);
    const context = await tx.unsafe(CONTEXT_QUERY, [
      'superbeginner',
      first[0].uuid,
      now - 86400000,
      now,
    ]);
    assert.equal(context.length, 3);
    assert.deepEqual(Object.keys(context[0]), ['uuid', 'room_id', 'name', 'time', 'excerpt']);
    const crossRoom = await tx.unsafe(CONTEXT_QUERY, [
      'hajime',
      first[0].uuid,
      now - 86400000,
      now,
    ]);
    assert.equal(crossRoom.length, 0);
    await tx`RESET ROLE`;
    await tx`DELETE FROM public.chats WHERE name='fixture' AND uuid BETWEEN '01993200-0000-7000-8000-000000000001'::uuid AND '01993200-0000-7000-8000-000000000004'::uuid`;
  });
  console.log(
    'Production SQL: AND search, keyset paging, deleted target and room isolation passed'
  );
} finally {
  await sql.end();
}
