-- 通報（chat_reports と insert_chat_report）の DB の統合テスト（pgTAP）。Task 0.6。
-- 実行: supabase test db supabase/tests/chat_reports.sql。最後に ROLLBACK する。

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(14);

INSERT INTO public.rooms (id, category) VALUES ('pgtap_report', 'beginner');
SET LOCAL ROLE service_role;
INSERT INTO public.chats (room_id, name, color, message, system, ip, ua)
VALUES ('pgtap_report', 'mallory', '#000000', 'bad words', false, '203.0.113.5', 'ua-m');
RESET ROLE;
CREATE TEMP TABLE target AS SELECT uuid FROM public.chats WHERE room_id = 'pgtap_report';
GRANT SELECT ON target TO service_role;

-- 1. 権限 -------------------------------------------------------------------
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.chat_reports'::regclass), 'RLS が有効');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE tablename = 'chat_reports'), 0, 'ポリシーは無い（service_role だけ）');
SELECT ok(NOT has_table_privilege('anon', 'public.chat_reports', 'SELECT'), 'anon は読めない');
SELECT ok(NOT has_function_privilege('anon', 'public.insert_chat_report(uuid, text, text, text, text, text, integer)', 'EXECUTE'), 'anon は通報の関数を呼べない');
SELECT ok(
    NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'chat_reports'),
    'Realtime に流さない'
);

-- 2. 保存と写し -------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT is(
    (SELECT status FROM public.insert_chat_report((SELECT uuid FROM target), 'harassment', '  ひどい  ', repeat('A', 43), '198.51.100.1', 'ua-r')),
    'ok', '通報を保存する'
);
SELECT is((SELECT snapshot->>'message' FROM public.chat_reports), 'bad words', '通報の時点の本文を写す');
SELECT is((SELECT snapshot->>'name' FROM public.chat_reports), 'mallory', '通報の時点の名前を写す');
SELECT ok((SELECT reporter_author_key_hash IS NOT NULL FROM public.chat_reports), '端末の鍵はハッシュで残す');
SELECT is((SELECT status FROM public.chat_reports), 'open', '受け付けた通報は open');
SELECT is(
    (SELECT status FROM public.insert_chat_report('00000000-0000-7000-8000-000000000000', 'spam', '', NULL, '198.51.100.2', '')),
    'not_found', '無い発言は保存しない'
);
SELECT throws_ok(
    $$SELECT * FROM public.insert_chat_report((SELECT uuid FROM target), 'nope', '', NULL, '198.51.100.3', '')$$,
    '23514', NULL, '知らない理由は CHECK で断る'
);

-- 3. 1 時間の制限 -----------------------------------------------------------
SELECT is(
    (SELECT array_agg(status ORDER BY n) FROM (
        SELECT n, (public.insert_chat_report((SELECT uuid FROM target), 'spam', '', NULL, '198.51.100.9', '', 3)).status
          FROM generate_series(1, 4) AS n
    ) s),
    ARRAY['ok', 'ok', 'ok', 'rate_limited'],
    '同じ IP からは 1 時間に上限まで'
);
SELECT is(
    (SELECT (public.insert_chat_report((SELECT uuid FROM target), 'spam', '', repeat('A', 43), '198.51.100.10', '', 1)).status),
    'rate_limited',
    '同じ端末の鍵なら IP が違っても数える'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
