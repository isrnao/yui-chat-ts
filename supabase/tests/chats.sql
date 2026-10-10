-- chats テーブルの DB の統合テスト（pgTAP）。
-- docs/SERVER_SIDE_LOGIC_REFACTORING.md §9 の P1（Issue #175）。
--
-- 発言の保存・消去・集計のロジックをサーバーへ移す変更（Issue #176〜#186）の安全網として、
-- まず今の RLS・列の権限・関数の振る舞いを固定する。規則を変える PR は、ここも同じ PR で書き換える。
--
-- 実行: supabase test db（ローカルの Supabase が起動していること）。
-- すべてトランザクションの中で行い、最後に ROLLBACK する。

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(67);

-- 共通の値 ----------------------------------------------------------------

-- テストの行は専用の部屋に入れ、既存の行と混ざらないようにする
CREATE TEMP TABLE t AS
SELECT
    'pgtap_room' AS room,
    floor(extract(epoch FROM now()) * 1000)::bigint AS now_ms;
GRANT SELECT ON t TO anon, authenticated, service_role;

-- テスト用の部屋（chats.room_id は rooms の外部キー。Issue #178）
INSERT INTO public.rooms (id, category) VALUES ('pgtap_room', 'beginner');

-- service_role（save-chat と同じ権限）で行を入れる
SET LOCAL ROLE service_role;
INSERT INTO public.chats (room_id, name, color, message, system, ip, ua, metadata)
VALUES
    ('pgtap_room', 'alice', '#ff69b4', 'hello', false, '203.0.113.9', 'ua-a', '{"version":1}'),
    ('pgtap_room', 'alice', '#ff69b4', 'again', false, '203.0.113.9', 'ua-a', NULL),
    ('pgtap_room', 'bob', '#000000', 'hi', false, '2001:db8::1', 'ua-b', NULL),
    ('pgtap_room', '管理人', '#ff69b4', 'bob さん、Welcome to お気楽チャット☆', true, '', '',
        '{"kind":"admin"}');
RESET ROLE;

-- 1. 表と Realtime ------------------------------------------------------------

SELECT ok(
    EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chats'
    ),
    'chats は supabase_realtime の publication に入っている'
);
SELECT ok(
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.chats'::regclass),
    'chats は RLS が有効'
);

-- 2. 列の権限 -------------------------------------------------------------------

SELECT ok(NOT has_column_privilege('anon', 'public.chats', 'ip', 'SELECT'), 'anon は ip を読めない');
SELECT ok(
    NOT has_column_privilege('authenticated', 'public.chats', 'ip', 'SELECT'), 'authenticated は ip を読めない'
);
SELECT ok(has_column_privilege('anon', 'public.chats', 'ip_masked', 'SELECT'), 'anon は ip_masked を読める');
SELECT ok(
    NOT has_column_privilege('anon', 'public.chats', 'deleted', 'UPDATE'),
    'anon は deleted も UPDATE できない（clear は clear_my_chats。Issue #179）'
);
SELECT ok(NOT has_column_privilege('anon', 'public.chats', 'message', 'UPDATE'), 'anon は message を UPDATE できない');
SELECT is(
    (SELECT count(*)::int FROM information_schema.column_privileges
        WHERE table_schema = 'public' AND table_name = 'chats'
          AND grantee IN ('anon', 'authenticated') AND privilege_type = 'UPDATE'),
    0,
    '列単位の UPDATE の権限も残っていない（テーブルの REVOKE で列の権限も取り消される）'
);

-- 3. anon の読み書き ------------------------------------------------------------

SET LOCAL ROLE anon;
SELECT throws_ok(
    $$SELECT ip FROM public.chats WHERE room_id = 'pgtap_room'$$, '42501', NULL, 'anon が ip を選ぶと権限エラー'
);
SELECT is(
    (SELECT ip_masked FROM public.chats WHERE room_id = 'pgtap_room' AND message = 'hello'),
    '203.*.*.9',
    'anon には伏せた IP が見える'
);
SELECT throws_ok(
    $$INSERT INTO public.chats (room_id, name, color, message) VALUES ('pgtap_room', 'x', '', 'y')$$,
    '42501', NULL, 'anon は直接 INSERT できない（save-chat を通す）'
);
SELECT throws_ok(
    $$UPDATE public.chats SET message = 'x' WHERE room_id = 'pgtap_room'$$,
    '42501', NULL, 'anon は deleted 以外の列を UPDATE できない'
);

-- clear は clear_my_chats だけ（Issue #179）。名前と部屋で他人の発言も消せた PATCH の経路は閉じている
SELECT throws_ok(
    $$UPDATE public.chats SET deleted = true WHERE room_id = 'pgtap_room' AND message = 'again'$$,
    '42501', NULL, 'anon は deleted を true にできない'
);
RESET ROLE;
SELECT ok(
    NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'chats' AND policyname = 'public-update'),
    'public-update ポリシーは無い'
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
    $$UPDATE public.chats SET deleted = true WHERE room_id = 'pgtap_room'$$,
    '42501', NULL, 'authenticated も UPDATE できない'
);
RESET ROLE;
-- 以降の集計のテストのために、1 件を消しておく（運営の削除と同じく service_role で）
SET LOCAL ROLE service_role;
UPDATE public.chats SET deleted = true WHERE room_id = 'pgtap_room' AND message = 'again';
RESET ROLE;

-- 4. 既定値 -------------------------------------------------------------------

SELECT is(
    (SELECT count(*)::int FROM public.chats WHERE room_id = 'pgtap_room' AND uuid::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-7'),
    4,
    'uuid は v7'
);
SELECT ok(
    (SELECT bool_and("time" BETWEEN t.now_ms - 60000 AND t.now_ms + 60000) FROM public.chats, t
        WHERE room_id = t.room),
    'time はサーバーの時刻（ミリ秒）'
);
SELECT is(
    (SELECT array_agg(message ORDER BY uuid) FROM public.chats WHERE room_id = 'pgtap_room'),
    ARRAY['hello', 'again', 'hi', 'bob さん、Welcome to お気楽チャット☆'],
    'uuid の順は保存の順（同じ文の中でも clock_timestamp で進む）'
);
SELECT is(
    (SELECT ip_masked FROM public.chats WHERE room_id = 'pgtap_room' AND name = 'bob'),
    '2001:*',
    'ip_masked は ip から作る生成列'
);

-- 5. 集計 -----------------------------------------------------------------------

SET LOCAL ROLE anon;
SELECT is(
    (SELECT array_agg(name || ':' || post_count ORDER BY name) FROM public.chat_ranking WHERE room_id = 'pgtap_room'),
    ARRAY['alice:2', 'bob:1'],
    'ランキングは system の発言を除き、削除済みも数える'
);
SELECT is(
    (SELECT host FROM public.chat_ranking WHERE room_id = 'pgtap_room' AND name = 'alice'),
    '203.*.*.9',
    'ランキングのホストは伏せた IP'
);
SELECT is(
    (SELECT participants FROM public.room_participant_counts(0) WHERE room_id = 'pgtap_room'),
    2,
    '人数は system の発言を除いた発言者の数（alice・bob）'
);
SELECT ok(
    has_function_privilege('anon', 'public.room_participant_counts(bigint)', 'EXECUTE'),
    'anon は人数の RPC を実行できる'
);
RESET ROLE;

-- 管理人の発言の除き方: system が false でも metadata.kind = admin なら人数から除く
SET LOCAL ROLE service_role;
INSERT INTO public.chats (room_id, name, color, message, system, metadata)
VALUES ('pgtap_room', '偽の管理人', '#000', 'x', false, '{"kind":"admin"}');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT is(
    (SELECT participants FROM public.room_participant_counts(0) WHERE room_id = 'pgtap_room'),
    2,
    '人数は metadata.kind = admin の発言を除く'
);
SELECT is(
    (SELECT count(*)::int FROM public.chat_ranking WHERE room_id = 'pgtap_room'),
    3,
    'ランキングは system だけで除く（kind は見ない）'
);
RESET ROLE;

-- 24 時間より古い since_ms は 24 時間前に切り上げる
SET LOCAL ROLE service_role;
UPDATE public.chats SET "time" = (SELECT now_ms FROM t) - 25 * 60 * 60 * 1000
WHERE room_id = 'pgtap_room' AND name = 'bob';
RESET ROLE;
SET LOCAL ROLE anon;
SELECT is(
    (SELECT participants FROM public.room_participant_counts(0) WHERE room_id = 'pgtap_room'),
    1,
    '人数は 24 時間より前の発言を見ない'
);
SELECT is(
    (SELECT count(*)::int FROM public.room_participant_counts(0) WHERE room_id = 'pgtap_room_none'),
    0,
    '発言の無い部屋は返らない'
);
RESET ROLE;

-- 6. 入力の CHECK 制約（Issue #176）---------------------------------------------

SELECT is(
    (SELECT array_agg(conname::text ORDER BY conname) FROM pg_constraint
        WHERE conrelid = 'public.chats'::regclass AND contype = 'c'),
    ARRAY['chats_color_check', 'chats_email_check', 'chats_message_check', 'chats_metadata_check', 'chats_name_check'],
    'chats に入力の CHECK 制約がある'
);

SET LOCAL ROLE service_role;
SELECT throws_ok(
    $$INSERT INTO public.chats (room_id, name, color, message) VALUES ('pgtap_room', repeat('a', 65), '#fff', 'x')$$,
    '23514', NULL, '名前は 64 文字まで'
);
SELECT throws_ok(
    $$INSERT INTO public.chats (room_id, name, color, message) VALUES ('pgtap_room', 'a', '#fff', '')$$,
    '23514', NULL, '空の発言は保存できない'
);
SELECT throws_ok(
    $$INSERT INTO public.chats (room_id, name, color, message) VALUES ('pgtap_room', 'a', '#fff', repeat('a', 2001))$$,
    '23514', NULL, '発言は 2000 文字まで'
);
SELECT throws_ok(
    $$INSERT INTO public.chats (room_id, name, color, message) VALUES ('pgtap_room', 'a', 'red;x', 'x')$$,
    '23514', NULL, '色は英数字と # だけ'
);
SELECT throws_ok(
    $$INSERT INTO public.chats (room_id, name, color, message, email) VALUES ('pgtap_room', 'a', '#fff', 'x', repeat('a', 257))$$,
    '23514', NULL, 'メールは 256 文字まで'
);
SELECT lives_ok(
    $$INSERT INTO public.chats (room_id, name, color, message, email)
      VALUES ('pgtap_room', repeat('😀', 64), 'lightgoldenrodyellow', repeat('😀', 2000), repeat('a', 256))$$,
    '上限ちょうどの値は保存できる（char_length はコードポイントで数える）'
);
RESET ROLE;

-- 7. metadata の CHECK 制約（Issue #177）-----------------------------------------

SET LOCAL ROLE service_role;
SELECT throws_ok(
    $$INSERT INTO public.chats (room_id, name, color, message, metadata) VALUES ('pgtap_room', 'a', '#fff', 'x', '[1]')$$,
    '23514', NULL, 'metadata は JSON のオブジェクトだけ'
);
SELECT throws_ok(
    $$INSERT INTO public.chats (room_id, name, color, message, metadata)
      VALUES ('pgtap_room', 'a', '#fff', 'x', jsonb_build_object('pad', repeat(md5(random()::text), 100)))$$,
    '23514', NULL, 'metadata は 2KB まで'
);
SELECT lives_ok(
    $$INSERT INTO public.chats (room_id, name, color, message, metadata)
      VALUES ('pgtap_room', 'a', '#fff', 'x', '{"version":1,"avatar":"hoshi1","optimisticNonce":"n"}')$$,
    '普通の metadata は保存できる'
);
SELECT lives_ok(
    $$INSERT INTO public.chats (room_id, name, color, message, metadata) VALUES ('pgtap_room', 'a', '#fff', 'x', NULL)$$,
    'metadata は無くてもよい'
);
RESET ROLE;

-- 8. 部屋（Issue #178）------------------------------------------------------------

SELECT is((SELECT count(*)::int FROM public.rooms WHERE id NOT LIKE 'pgtap%'), 82, 'rooms は rooms.ts の 82 部屋');
SELECT is(
    (SELECT array_agg(id) FROM public.rooms WHERE triage), ARRAY['com_sb'], 'triage の対象は管理者チャットだけ'
);
SET LOCAL ROLE anon;
SELECT is((SELECT category FROM public.rooms WHERE id = 'superbeginner'), 'beginner', 'anon は部屋の一覧を読める');
SELECT throws_ok(
    $$INSERT INTO public.rooms (id, category) VALUES ('x', 'beginner')$$,
    '42501', NULL, 'anon は部屋を足せない'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok(
    $$INSERT INTO public.chats (room_id, name, color, message) VALUES ('no_such_room', 'a', '#fff', 'x')$$,
    '23503', NULL, '知らない部屋には保存できない（外部キー）'
);
SELECT is(
    (SELECT r.triage FROM public.chats AS c JOIN public.rooms AS r ON r.id = c.room_id
        WHERE c.room_id = 'pgtap_room' LIMIT 1),
    false,
    '発言から部屋の triage を引ける（save-chat が埋め込む rooms(triage)）'
);
RESET ROLE;

-- 9. insert_chat と clear_my_chats（Issue #179）------------------------------------

-- 鍵は base64url の 43 文字
CREATE TEMP TABLE k AS SELECT repeat('A', 43) AS mine, repeat('B', 43) AS other;
GRANT SELECT ON k TO anon, authenticated, service_role;

SELECT ok(
    NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_authors'
    ),
    'chat_authors は Realtime の publication に入っていない'
);
SELECT ok(NOT has_table_privilege('anon', 'public.chat_authors', 'SELECT'), 'anon は chat_authors を読めない');
SELECT ok(
    NOT has_function_privilege('anon', 'public.insert_chat(jsonb, text, uuid)', 'EXECUTE'), 'anon は insert_chat を呼べない'
);
SELECT ok(
    has_function_privilege('anon', 'public.clear_my_chats(text, text, text)', 'EXECUTE'), 'anon は clear_my_chats を呼べる'
);

SET LOCAL ROLE service_role;
CREATE TEMP TABLE saved AS
SELECT * FROM public.insert_chat(
    jsonb_build_array(
        jsonb_build_object('room_id', 'pgtap_room', 'name', 'carol', 'color', '#123', 'message', 'おみくじ',
            'ip', '198.51.100.7', 'ua', 'ua-c', 'author', true, 'metadata', jsonb_build_object('version', 1)),
        jsonb_build_object('room_id', 'pgtap_room', 'name', '巫女', 'color', 'hotpink', 'message', '大吉で〜す。',
            'system', true, 'author', false)
    ),
    (SELECT mine FROM k)
);
RESET ROLE;

SELECT is((SELECT count(*)::int FROM saved), 2, 'insert_chat は配列の行をすべて入れて返す');
SELECT ok(
    (SELECT (array_agg(uuid ORDER BY ord))[1] < (array_agg(uuid ORDER BY ord))[2]
        FROM (SELECT uuid, row_number() OVER () AS ord FROM saved) AS s),
    '配列の順に並ぶ（巫女の返事は発言の後）'
);
SELECT is(
    (SELECT ip_masked FROM saved LIMIT 1), '198.*.*.7', 'insert_chat は ip_masked を返す'
);
SELECT is((SELECT bool_or(triage) FROM saved), false, 'insert_chat は部屋の triage を返す');
SELECT is(
    (SELECT count(*)::int FROM public.chat_authors WHERE chat_uuid IN (SELECT uuid FROM saved)),
    1,
    'author = true の行だけ鍵のハッシュを書く'
);
SELECT is(
    (SELECT system FROM public.chats WHERE uuid = (SELECT uuid FROM saved OFFSET 1 LIMIT 1)),
    true,
    'system を保存する'
);

SET LOCAL ROLE service_role;
SELECT throws_ok(
    $$SELECT * FROM public.insert_chat('[{"room_id":"no_such_room","name":"a","color":"#fff","message":"x"}]')$$,
    '23503', NULL, 'insert_chat も知らない部屋を止める'
);
SELECT throws_ok($$SELECT * FROM public.insert_chat('[]')$$, '22023', NULL, '空の配列は誤り');
SELECT is(
    (SELECT count(*)::int FROM public.insert_chat(
        '[{"room_id":"pgtap_room","name":"carol","color":"#fff","message":"鍵なし","author":true}]', 'short')),
    1,
    '形の合わない鍵でも保存はする'
);
RESET ROLE;
SELECT is(
    (SELECT count(*)::int FROM public.chat_authors AS a JOIN public.chats AS c ON c.uuid = a.chat_uuid
        WHERE c.message = '鍵なし'),
    0,
    '形の合わない鍵は chat_authors に書かない'
);

-- 同じ名前の他人（別の鍵）と、鍵の無い古い発言を用意する
SET LOCAL ROLE service_role;
SELECT * FROM public.insert_chat(
    '[{"room_id":"pgtap_room","name":"carol","color":"#fff","message":"なりすまし","author":true}]',
    (SELECT other FROM k)
);
INSERT INTO public.chats (room_id, name, color, message) VALUES ('pgtap_room', 'carol', '#fff', '移行前');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT is(
    cardinality(public.clear_my_chats('pgtap_room', 'carol', (SELECT other FROM k))),
    1,
    '別の鍵では自分の 1 件だけ消える'
);
SELECT is(
    cardinality(public.clear_my_chats('pgtap_room', 'carol', (SELECT mine FROM k))),
    1,
    '自分の鍵で、部屋と名前が一致する未削除の発言だけ消える（件数を返す）'
);
SELECT is(
    cardinality(public.clear_my_chats('pgtap_room', 'carol', (SELECT mine FROM k))),
    0,
    '消した後にもう一度呼ぶと 0 件'
);
SELECT is(
    cardinality(public.clear_my_chats('pgtap_room', 'carol', 'short')), 0, '形の合わない鍵では何も消えない'
);
RESET ROLE;
SELECT is(
    (SELECT array_agg(message ORDER BY uuid) FROM public.chats WHERE room_id = 'pgtap_room' AND name = 'carol' AND NOT deleted),
    ARRAY['鍵なし', '移行前'],
    '鍵の無い発言（移行前を含む）は消えない'
);

-- 10. insert_chat の冪等（同じ送信操作の再送で二重に入れない）--------------------------------

SET LOCAL ROLE service_role;
CREATE TEMP TABLE first_try AS
SELECT * FROM public.insert_chat(
    '[{"room_id":"pgtap_room","name":"dave","color":"#fff","message":"おみくじ","author":true},
      {"room_id":"pgtap_room","name":"巫女","color":"hotpink","message":"大吉","system":true}]',
    NULL,
    '00000000-0000-4000-8000-0000000000aa'
);
CREATE TEMP TABLE second_try AS
SELECT * FROM public.insert_chat(
    '[{"room_id":"pgtap_room","name":"dave","color":"#fff","message":"おみくじ","author":true},
      {"room_id":"pgtap_room","name":"巫女","color":"hotpink","message":"凶","system":true}]',
    NULL,
    '00000000-0000-4000-8000-0000000000aa'
);
RESET ROLE;
SELECT is(
    (SELECT array_agg(uuid ORDER BY uuid) FROM second_try),
    (SELECT array_agg(uuid ORDER BY uuid) FROM first_try),
    '同じ送信操作の ID の再送は、1 回目の行を返す'
);
SELECT is(
    (SELECT count(*)::int FROM public.chats
        WHERE room_id = 'pgtap_room' AND (name = 'dave' OR message IN ('大吉', '凶'))),
    2,
    '再送しても発言と巫女の返事は 1 行ずつ（別の運勢の 2 行目は入らない）'
);
SELECT ok(
    NOT has_table_privilege('anon', 'public.chat_operations', 'SELECT'), 'anon は chat_operations を読めない'
);
SELECT ok(
    EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chat-operations-purge'),
    'chat_operations を消すジョブがある'
);

SELECT * FROM finish();
ROLLBACK;
