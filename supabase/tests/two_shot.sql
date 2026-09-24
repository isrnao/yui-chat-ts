-- ツーショットチャットの DB の統合テスト（pgTAP）。
-- spec: .kiro/specs/two-shot-chat/tasks.md Task 2.10
--
-- 実行: supabase test db（ローカルの Supabase が起動していること）。
-- すべてトランザクションの中で行い、最後に ROLLBACK する。
-- 同時実行そのものは再現しないが、同時実行で起きる状態（version の食い違い・同じトークンの再利用・
-- 途中の失敗）を順番に作り、two_shot_commit が「全部保存するか、何も保存しないか」を確かめる。

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(41);

-- 共通の値 ----------------------------------------------------------------

-- 基準時刻はトランザクション開始の時刻（一覧の two_shot_lobby() が使う now() と同じ）にする。
-- 保存の関数は実時刻（clock_timestamp）を使うので、テストの中ではそれより少し先に進んでいる
CREATE TEMP TABLE t AS
SELECT
    floor(extract(epoch FROM now()) * 1000)::bigint AS now_ms,
    '{"memberId":"00000000-0000-4000-8000-00000000000a","tokenHash":"aa","name":"alice","sex":"F","profile":"hi","ip":"203.0.113.1","ua":"ua"}'::jsonb AS owner,
    repeat('a', 64) AS token_a,
    repeat('b', 64) AS token_b,
    repeat('c', 64) AS request_hash;
GRANT SELECT ON t TO anon, authenticated, service_role;

-- 1. 権限 -------------------------------------------------------------------

SELECT ok(NOT has_table_privilege('anon', 'public.two_shot_rooms', 'SELECT'), 'anon は部屋の表を読めない');
SELECT ok(NOT has_table_privilege('authenticated', 'public.two_shot_rooms', 'UPDATE'), 'authenticated は部屋の表を書けない');
SELECT ok(NOT has_table_privilege('anon', 'public.two_shot_admissions', 'SELECT'), 'anon は入室記録を読めない');
SELECT ok(NOT has_table_privilege('authenticated', 'public.two_shot_audit', 'SELECT'), 'authenticated は会話の控えを読めない');
SELECT ok(NOT has_table_privilege('anon', 'public.two_shot_audit_recent', 'SELECT'), 'anon は控えのビューを読めない');
SELECT ok(
    NOT has_function_privilege('anon', 'public.two_shot_commit(text, bigint, bigint, jsonb, jsonb, jsonb)', 'EXECUTE'),
    'anon は保存の関数を実行できない'
);
SELECT ok(
    NOT has_function_privilege('authenticated', 'public.two_shot_commit(text, bigint, bigint, jsonb, jsonb, jsonb)', 'EXECUTE'),
    'authenticated は保存の関数を実行できない'
);
SELECT ok(has_function_privilege('anon', 'public.two_shot_lobby()', 'EXECUTE'), 'anon は一覧を取得できる');

SET LOCAL ROLE anon;
SELECT throws_ok('SELECT * FROM public.two_shot_rooms', '42501', NULL, 'anon の SELECT は権限エラー');
SELECT throws_ok(
    $$SELECT public.two_shot_commit('01', 0, 0, NULL, NULL, NULL)$$, '42501', NULL, 'anon の保存は権限エラー'
);
SELECT is((SELECT count(*)::int FROM public.two_shot_lobby()), 12, 'anon の一覧は 12 部屋');
SELECT is(
    (SELECT count(*)::int FROM public.two_shot_lobby() WHERE status = 'empty'), 12, '初期状態は全部屋が空室'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT * FROM public.two_shot_maintenance_health()$$, 'service_role は削除ジョブの状態を読める');
RESET ROLE;

-- 2. 一覧の規則 ---------------------------------------------------------------

UPDATE public.two_shot_rooms SET state = jsonb_build_object(
    'lastActivityAt', (SELECT now_ms FROM t), 'seats', jsonb_build_array((SELECT owner FROM t), NULL), 'lines', '[]'::jsonb)
WHERE room_id = '01';
SELECT is(
    (SELECT row(status, sex, name, profile)::text FROM public.two_shot_lobby() WHERE room_id = '01'),
    '(waiting,F,alice,hi)', '入室者の席が JSON の null なら待機中で、管制者の情報を返す'
);
UPDATE public.two_shot_rooms SET state = jsonb_set(state, '{seats,1}', (SELECT owner FROM t)) WHERE room_id = '01';
SELECT is(
    (SELECT row(status, sex, name, profile)::text FROM public.two_shot_lobby() WHERE room_id = '01'),
    '(full,,,)', '満室では名前などを返さない'
);
UPDATE public.two_shot_rooms SET state = jsonb_set(state, '{lastActivityAt}', to_jsonb((SELECT now_ms FROM t) - 300000))
WHERE room_id = '01';
SELECT is((SELECT status FROM public.two_shot_lobby() WHERE room_id = '01'), 'empty', '300 秒前の部屋は空室');
SELECT is(
    (SELECT state ->> 'lastActivityAt' FROM public.two_shot_rooms WHERE room_id = '01')::bigint,
    (SELECT now_ms FROM t) - 300000, '一覧の取得は書き込まない'
);

-- 3. CAS -----------------------------------------------------------------------

UPDATE public.two_shot_rooms SET version = 5, state = '{"lastActivityAt":null,"seats":[null,null],"lines":[]}'
WHERE room_id = '02';

SELECT is(
    public.two_shot_commit('02', 4, (SELECT now_ms FROM t), '{"lastActivityAt":1,"seats":[null,null],"lines":[]}', NULL, NULL),
    'conflict', 'version が違えば conflict'
);
SELECT is((SELECT version FROM public.two_shot_rooms WHERE room_id = '02'), 5::bigint, 'conflict では version を変えない');

SELECT is(
    public.two_shot_commit('02', 5, (SELECT now_ms FROM t),
        jsonb_build_object('lastActivityAt', (SELECT now_ms FROM t), 'seats', jsonb_build_array((SELECT owner FROM t), NULL), 'lines', '[]'::jsonb),
        NULL, NULL),
    'committed', 'version が同じなら保存する'
);
SELECT is((SELECT version FROM public.two_shot_rooms WHERE room_id = '02'), 6::bigint, '保存すると version が 1 増える');

-- 評価に使った時刻では時間切れ前、実時刻では時間切れ（300 秒の境界をまたいだ）なら conflict
UPDATE public.two_shot_rooms SET state = jsonb_set(state, '{lastActivityAt}', to_jsonb((SELECT now_ms FROM t) - 300500))
WHERE room_id = '02';
SELECT is(
    public.two_shot_commit('02', 6, (SELECT now_ms FROM t) - 1000, '{"lastActivityAt":null,"seats":[null,null],"lines":[]}', NULL, NULL),
    'conflict', '評価時と実時刻で時間切れの判定が違えば conflict'
);

-- 4. 入室記録 -----------------------------------------------------------------

SELECT is(
    public.two_shot_commit('03', 0, (SELECT now_ms FROM t),
        jsonb_build_object('lastActivityAt', (SELECT now_ms FROM t), 'seats', jsonb_build_array((SELECT owner FROM t), NULL), 'lines', '[]'::jsonb),
        jsonb_build_object('tokenHash', (SELECT token_a FROM t), 'requestHash', (SELECT request_hash FROM t),
            'attemptAtMs', (SELECT now_ms FROM t), 'memberId', '00000000-0000-4000-8000-00000000000a', 'result', 'accepted'),
        NULL),
    'committed', '入室と入室記録を一緒に保存する'
);
SELECT is(
    (SELECT row(room_id, result, member_id)::text FROM public.two_shot_admissions WHERE token_hash = (SELECT token_a FROM t)),
    '(03,accepted,00000000-0000-4000-8000-00000000000a)', '入室記録が残る'
);

-- 同じトークンを別の部屋へ（同時送信・転用）: 入室記録の一意制約で 1 回だけにする
SELECT is(
    public.two_shot_commit('04', 0, (SELECT now_ms FROM t),
        jsonb_build_object('lastActivityAt', (SELECT now_ms FROM t), 'seats', jsonb_build_array((SELECT owner FROM t), NULL), 'lines', '[]'::jsonb),
        jsonb_build_object('tokenHash', (SELECT token_a FROM t), 'requestHash', (SELECT request_hash FROM t),
            'attemptAtMs', (SELECT now_ms FROM t), 'memberId', '00000000-0000-4000-8000-00000000000b', 'result', 'accepted'),
        NULL),
    'admission-conflict', '同じトークンの 2 回目は admission-conflict'
);
SELECT is(
    (SELECT row(version, state ->> 'lastActivityAt')::text FROM public.two_shot_rooms WHERE room_id = '04'),
    '(0,)', 'admission-conflict では部屋を変えない'
);

-- 拒否された入室の記録だけを保存（状態は変えないので version も増えない）
SELECT is(
    public.two_shot_commit('03', 1, (SELECT now_ms FROM t), NULL,
        jsonb_build_object('tokenHash', (SELECT token_b FROM t), 'requestHash', (SELECT request_hash FROM t),
            'attemptAtMs', (SELECT now_ms FROM t), 'memberId', NULL, 'result', 'duplicate'),
        NULL),
    'committed', '重複入室の記録だけを保存する'
);
SELECT is((SELECT version FROM public.two_shot_rooms WHERE room_id = '03'), 1::bigint, '記録だけなら version は増えない');

-- 受付期限（作成から 10 分）を過ぎた新規の試行は、何も保存しない
SELECT is(
    public.two_shot_commit('05', 0, (SELECT now_ms FROM t),
        jsonb_build_object('lastActivityAt', (SELECT now_ms FROM t), 'seats', jsonb_build_array((SELECT owner FROM t), NULL), 'lines', '[]'::jsonb),
        jsonb_build_object('tokenHash', repeat('d', 64), 'requestHash', (SELECT request_hash FROM t),
            'attemptAtMs', (SELECT now_ms FROM t) - 600001, 'memberId', '00000000-0000-4000-8000-00000000000d', 'result', 'accepted'),
        NULL),
    'expired-entry', '受付期限を過ぎた試行は expired-entry'
);
SELECT is(
    (SELECT count(*)::int FROM public.two_shot_admissions WHERE token_hash = repeat('d', 64))
        + (SELECT version FROM public.two_shot_rooms WHERE room_id = '05')::int,
    0, 'expired-entry では入室記録も部屋も保存しない'
);

-- 5. 会話の控えと、失敗時の全体の取り消し ---------------------------------------

SELECT is(
    public.two_shot_commit('03', 1, (SELECT now_ms FROM t),
        jsonb_build_object('lastActivityAt', (SELECT now_ms FROM t), 'seats', jsonb_build_array((SELECT owner FROM t), NULL), 'lines', '[]'::jsonb),
        NULL,
        jsonb_build_object('atMs', (SELECT now_ms FROM t), 'memberId', '00000000-0000-4000-8000-00000000000a',
            'seat', 0, 'name', 'alice', 'text', 'こんにちは', 'ip', '203.0.113.1')),
    'committed', '発言と会話の控えを一緒に保存する'
);
SELECT is(
    (SELECT row(room_version, name, text)::text FROM public.two_shot_audit WHERE room_id = '03'),
    '(2,alice,こんにちは)', '控えは保存後の version で残る'
);

-- 控えの INSERT が失敗したら（ここでは主キーの重複）、入室記録も状態も残さない
INSERT INTO public.two_shot_audit (room_id, room_version, at, member_id, seat, name, text)
VALUES ('03', 3, now(), '00000000-0000-4000-8000-00000000000a', 0, 'x', 'x');
SELECT throws_ok(
    format($$SELECT public.two_shot_commit('03', 2, %s,
        '{"lastActivityAt":1,"seats":[null,null],"lines":[]}',
        '{"tokenHash":"%s","requestHash":"%s","attemptAtMs":%s,"memberId":"00000000-0000-4000-8000-00000000000e","result":"accepted"}',
        '{"atMs":1,"memberId":"00000000-0000-4000-8000-00000000000a","seat":0,"name":"alice","text":"x","ip":null}')$$,
        (SELECT now_ms FROM t), repeat('e', 64), (SELECT request_hash FROM t), (SELECT now_ms FROM t)),
    '23505', NULL, '控えの保存に失敗したら例外にする'
);
SELECT is(
    (SELECT version FROM public.two_shot_rooms WHERE room_id = '03')::int
        + (SELECT count(*)::int FROM public.two_shot_admissions WHERE token_hash = repeat('e', 64)),
    2, '失敗した保存は version も入室記録も残さない'
);

-- 6. 定期削除 -----------------------------------------------------------------

SELECT is(
    (SELECT string_agg(jobname || ' ' || schedule, ', ' ORDER BY jobname) FROM cron.job
        WHERE jobname LIKE 'two-shot-%'),
    'two-shot-purge-admissions 17 * * * *, two-shot-purge-audit 23 * * * *', '削除ジョブが毎時で登録されている'
);

INSERT INTO public.two_shot_admissions (token_hash, room_id, request_hash, attempt_at, member_id, result)
VALUES (repeat('f', 64), '06', repeat('c', 64), now() - interval '24 hours 1 second', NULL, 'full');
INSERT INTO public.two_shot_audit (room_id, room_version, at, member_id, seat, name, text)
VALUES ('06', 1, now() - interval '30 days 1 second', '00000000-0000-4000-8000-00000000000f', 0, 'old', 'old'),
       ('06', 2, now() - interval '29 days', '00000000-0000-4000-8000-00000000000f', 0, 'new', 'new');

SELECT is(
    (SELECT count(*)::int FROM public.two_shot_audit_recent WHERE room_id = '06'), 1,
    '管理者の確認用のビューは 30 日以内の行だけを見せる'
);

DO $$
BEGIN
    EXECUTE (SELECT command FROM cron.job WHERE jobname = 'two-shot-purge-admissions');
    EXECUTE (SELECT command FROM cron.job WHERE jobname = 'two-shot-purge-audit');
END
$$;

SELECT is(
    (SELECT count(*)::int FROM public.two_shot_admissions WHERE token_hash IN (repeat('f', 64), (SELECT token_a FROM t))),
    1, '24 時間を過ぎた入室記録だけを消す'
);
SELECT is(
    (SELECT string_agg(name, ',') FROM public.two_shot_audit WHERE room_id = '06'), 'new',
    '30 日を過ぎた控えだけを消す'
);

-- 7. 削除ジョブの監視 --------------------------------------------------------

SELECT is(
    (SELECT string_agg(jobname || ':' || active::text, ',') FROM public.two_shot_maintenance_health()),
    'two-shot-purge-admissions:true,two-shot-purge-audit:true',
    '監視は 2 つのジョブを返す（一度も動いていなければ healthy は false）'
);

-- ジョブが消えても行は残り、異常として返す（消えた行を返さないと、false を見る監視が見逃す）
DO $$ BEGIN PERFORM cron.unschedule('two-shot-purge-audit'); END $$;
SELECT is(
    (SELECT row(active, last_status, healthy)::text FROM public.two_shot_maintenance_health()
     WHERE jobname = 'two-shot-purge-audit'),
    '(f,missing,f)', '削除されたジョブは missing・healthy = false で返す'
);
SELECT is((SELECT count(*)::int FROM public.two_shot_maintenance_health()), 2, 'ジョブが消えても 2 行を返す');

SELECT * FROM finish();
ROLLBACK;
