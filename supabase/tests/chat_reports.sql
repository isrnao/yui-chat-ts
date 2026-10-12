-- 通報（chat_reports と insert_chat_report）の DB の統合テスト（pgTAP）。Task 0.6 と PR #218 のレビュー。
-- 実行: supabase test db supabase/tests/chat_reports.sql。最後に ROLLBACK する。

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(21);

INSERT INTO public.rooms (id, category) VALUES ('pgtap_report', 'beginner');
SET LOCAL ROLE service_role;
INSERT INTO public.chats (room_id, name, color, message, system, ip, ua)
SELECT 'pgtap_report', 'mallory', '#000000', 'bad words ' || n, false, '203.0.113.5', 'ua-m'
  FROM generate_series(1, 6) AS n;
RESET ROLE;
-- n 番目の発言（1〜6）
CREATE TEMP TABLE target AS
SELECT row_number() OVER (ORDER BY message) AS n, uuid FROM public.chats WHERE room_id = 'pgtap_report';
GRANT SELECT ON target TO service_role;
CREATE FUNCTION pg_temp.chat(i bigint) RETURNS uuid LANGUAGE sql AS $$ SELECT uuid FROM target WHERE n = i $$;

-- 1. 権限 -------------------------------------------------------------------
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.chat_reports'::regclass), 'RLS が有効');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE tablename = 'chat_reports'), 0, 'ポリシーは無い（service_role だけ）');
SELECT ok(NOT has_table_privilege('anon', 'public.chat_reports', 'SELECT'), 'anon は読めない');
SELECT ok(
    NOT has_function_privilege('anon', 'public.insert_chat_report(uuid, text, text, text, text, text, text, integer, integer)', 'EXECUTE'),
    'anon は通報の関数を呼べない'
);
SELECT ok(
    NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'chat_reports'),
    'Realtime に流さない'
);

-- 2. 保存と写し -------------------------------------------------------------
SET LOCAL ROLE service_role;
CREATE TEMP TABLE first_report AS
SELECT * FROM public.insert_chat_report(pg_temp.chat(1), 'child_safety', '  ひどい  ', repeat('A', 43), '198.51.100.1', 'ua-r');
SELECT is((SELECT status FROM first_report), 'ok', '通報を保存する');
SELECT ok((SELECT first_for_chat FROM first_report), 'その発言へのその理由の最初の通報');
SELECT is((SELECT snapshot->>'message' FROM public.chat_reports), 'bad words 1', '通報の時点の本文を写す');
SELECT is((SELECT snapshot->>'name' FROM public.chat_reports), 'mallory', '通報の時点の名前を写す');
SELECT ok((SELECT reporter_author_key_hash IS NOT NULL FROM public.chat_reports), '端末の鍵はハッシュで残す');
SELECT is((SELECT status FROM public.chat_reports), 'open', '受け付けた通報は open');
SELECT is(
    (SELECT status FROM public.insert_chat_report('00000000-0000-7000-8000-000000000000', 'spam', '', NULL, '198.51.100.2', '')),
    'not_found', '無い発言は保存しない'
);
SELECT throws_ok(
    $$SELECT * FROM public.insert_chat_report(pg_temp.chat(2), 'nope', '', NULL, '198.51.100.3', '')$$,
    '23514', NULL, '知らない理由は CHECK で断る'
);

-- 3. 同じ発言の通報 ---------------------------------------------------------
SELECT is(
    (SELECT row(status, report_id)::text FROM public.insert_chat_report(pg_temp.chat(1), 'spam', '', repeat('A', 43), '198.51.100.4', '')),
    (SELECT row('duplicate'::text, report_id)::text FROM first_report),
    '同じ端末が同じ発言をもう一度通報したら、保存せずに前の通報を返す'
);
SELECT is(
    (SELECT row(status, first_for_chat)::text FROM public.insert_chat_report(pg_temp.chat(1), 'child_safety', '', repeat('B', 43), '198.51.100.5', '')),
    row('ok'::text, false)::text,
    '別の人の同じ理由の通報は保存するが、最初の通報ではない（アラートは 1 回）'
);

-- 4. 1 時間の制限 -----------------------------------------------------------
SELECT is(
    (SELECT array_agg(status ORDER BY n) FROM (
        SELECT n, (public.insert_chat_report(pg_temp.chat(n), 'spam', '', NULL, '', '', '192.0.2.9', 3)).status
          FROM generate_series(2, 5) AS n
    ) s),
    ARRAY['ok', 'ok', 'ok', 'rate_limited'],
    '同じ制限用の IP からは 1 時間に上限まで'
);
SELECT is(
    (SELECT (public.insert_chat_report(pg_temp.chat(6), 'spam', '', repeat('C', 43), '192.0.2.9', '', '', 1)).status),
    'ok',
    '記録のための IP（送る側が付けられる）では数えない'
);
SELECT is(
    (SELECT (public.insert_chat_report(pg_temp.chat(5), 'spam', '', repeat('C', 43), '', '', '192.0.2.10', 1)).status),
    'rate_limited',
    '同じ端末の鍵なら制限用の IP が違っても数える'
);
SELECT is(
    (SELECT (public.insert_chat_report(pg_temp.chat(6), 'other', '', repeat('D', 43), '', '', '', 10,
        (SELECT count(*)::int FROM public.chat_reports))).status),
    'rate_limited_global',
    '全体の上限を超えたら保存しない'
);
RESET ROLE;

-- 5. IP と UA の期限 --------------------------------------------------------
SELECT ok(
    EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chat-reports-clear-ip' AND active),
    'IP と UA を 90 日で空にするジョブがある'
);
SELECT is(
    (SELECT count(*)::int FROM public.chat_reports WHERE rate_ip = '192.0.2.9'),
    3,
    '制限用の IP を残す'
);

SELECT * FROM finish();
ROLLBACK;
