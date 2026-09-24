-- ツーショットチャット（/chat/2shot/）のテーブル・公開一覧・保存用の関数・定期削除を追加する。
-- spec: .kiro/specs/two-shot-chat/design.md §7（Requirement 14 / 15）
--
-- 設計:
--   - 状態遷移の規則は Edge Function（supabase/functions/two-shot/rules.ts）が TypeScript で持つ。
--     SQL は「保存の境界」だけを受け持つ: 部屋 1 行の version による CAS、入室記録（再送の判定用）、
--     会話の控え（Q4(b)）を two_shot_commit の 1 トランザクションで確定する。一部だけの保存はしない
--   - 2 人の会話は非公開。3 つのテーブルは RLS を有効にしてポリシーを作らず、anon / authenticated の
--     権限をすべて外す。読み書きは service_role（Edge Function）だけ
--   - 一覧（空室状況）は two_shot_lobby() だけを anon に公開する。返すのは部屋の ID・状態と、待機中の
--     管制者の性別・名前・プロフィールだけ。一覧の取得は書き込まない（時間切れは読むときに計算する）
--
-- 時刻: state の中の時刻は Unix ミリ秒。無発言監視タイマ（300 秒）は rules.ts の IDLE_SECONDS と同じ値で、
--       下の自己検証と src/features/two-shot-chat/rules.test.ts の両方で境界を確かめる。
--
-- 適用順序（重要）:
--   本マイグレーションを先に適用し、その後に `supabase functions deploy two-shot` を行う。
--   画面の切り替え（/chat/2shot/ の Task 8）は、両方の反映と削除ジョブの確認が済んでから。
--   既存の表・関数・画面には影響しない。

-- ---------------------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.two_shot_rooms (
    room_id    text PRIMARY KEY CHECK (room_id ~ '^[0-9]{2}$'),
    version    bigint NOT NULL DEFAULT 0,
    -- rules.ts の RoomState。seats は JSON の null で埋める（配列の穴や undefined を持ち込まない）
    state      jsonb NOT NULL DEFAULT '{"lastActivityAt":null,"seats":[null,null],"lines":[]}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.two_shot_rooms IS
    'ツーショットチャットの部屋。部屋ごと 1 行の状態（席・ログ・最終発言時刻）。service_role だけが読み書きする。';

-- 入室試行の記録。応答を受け取れずに同じ試行を再送したとき、同じ結果を返すために使う。
-- 生のトークン・IP・UA・入力値は置かない（トークンは SHA-256 だけ）。24 時間で消す。
CREATE TABLE IF NOT EXISTS public.two_shot_admissions (
    token_hash   text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    room_id      text NOT NULL REFERENCES public.two_shot_rooms (room_id),
    request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    -- トークンに含まれる作成時刻。受付期限（10 分）と保持期限（24 時間）の起点
    attempt_at   timestamptz NOT NULL,
    member_id    uuid,
    result       text NOT NULL CHECK (result IN ('accepted', 'duplicate', 'full')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    CHECK ((result = 'accepted') = (member_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_two_shot_admissions_attempt_at
    ON public.two_shot_admissions (attempt_at);

COMMENT ON TABLE public.two_shot_admissions IS
    'ツーショットチャットの入室試行の記録（再送の判定用）。トークンのハッシュだけを持つ。24 時間で削除する。';

-- 会話の控え（Q4(b)）。通報があったときだけ管理者が確認する。画面のログとは別の保存先で、30 日で消す。
-- 主キーは部屋と保存後の version（同じ部屋で 1 回の保存に 1 行）。トークン・ハッシュ・UA は置かない。
CREATE TABLE IF NOT EXISTS public.two_shot_audit (
    room_id      text NOT NULL REFERENCES public.two_shot_rooms (room_id),
    room_version bigint NOT NULL,
    at           timestamptz NOT NULL,
    member_id    uuid NOT NULL,
    seat         smallint NOT NULL CHECK (seat IN (0, 1)),
    name         text NOT NULL,
    text         text NOT NULL,
    ip           text,
    PRIMARY KEY (room_id, room_version)
);

CREATE INDEX IF NOT EXISTS idx_two_shot_audit_at ON public.two_shot_audit (at);

COMMENT ON TABLE public.two_shot_audit IS
    'ツーショットチャットの会話の控え（通報対応用）。service_role だけが読める。30 日を過ぎた行は毎時削除する。';

-- 管理者の確認用。30 日以内の行だけを見せる（削除ジョブが遅れても 30 日を超えた行は参照しない）
CREATE OR REPLACE VIEW public.two_shot_audit_recent
WITH (security_invoker = true) AS
    SELECT * FROM public.two_shot_audit WHERE at > now() - interval '30 days';

-- 部屋 01〜10（rules.ts の ROOM_IDS と同じ。変えるときはマイグレーションを足す）
INSERT INTO public.two_shot_rooms (room_id)
    SELECT to_char(n, 'FM00') FROM generate_series(1, 10) AS n
    ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 権限
-- ---------------------------------------------------------------------------
-- baseline の ALTER DEFAULT PRIVILEGES で anon / authenticated にも GRANT ALL が付くので、明示的に外す。
-- RLS は有効にしてポリシーを作らない（外し忘れの GRANT があっても行が見えないように二重にする）。

ALTER TABLE public.two_shot_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.two_shot_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.two_shot_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.two_shot_rooms, public.two_shot_admissions, public.two_shot_audit,
    public.two_shot_audit_recent
    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
    ON TABLE public.two_shot_rooms, public.two_shot_admissions, public.two_shot_audit
    TO service_role;
GRANT SELECT ON TABLE public.two_shot_audit_recent TO service_role;

-- ---------------------------------------------------------------------------
-- 公開一覧（Lobby_View）
-- ---------------------------------------------------------------------------
-- 空室: 最終発言時刻がない（JSON の null を含む）・管制者の席がない・最後の発言から 300 秒以上
-- 満室: 入室者の席が JSON のオブジェクト（JSON の null は不在として扱う）
-- 待機中: それ以外。このときだけ管制者の性別・名前・プロフィールを返す
-- 容量超過（ログが概算 5000 バイト超）は原作どおり次の部屋への操作で閉じるので、ここでは見ない。

CREATE OR REPLACE FUNCTION public.two_shot_lobby()
RETURNS TABLE (room_id text, status text, sex text, name text, profile text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH rooms AS (
        SELECT
            r.room_id,
            r.state -> 'seats' -> 0 AS owner,
            CASE
                WHEN jsonb_typeof(r.state -> 'lastActivityAt') IS DISTINCT FROM 'number'
                    OR jsonb_typeof(r.state -> 'seats' -> 0) IS DISTINCT FROM 'object'
                    OR extract(epoch FROM now()) * 1000 - (r.state ->> 'lastActivityAt')::numeric >= 300000
                    THEN 'empty'
                WHEN jsonb_typeof(r.state -> 'seats' -> 1) = 'object' THEN 'full'
                ELSE 'waiting'
            END AS status
        FROM public.two_shot_rooms AS r
    )
    SELECT
        rooms.room_id,
        rooms.status,
        CASE WHEN rooms.status = 'waiting' THEN rooms.owner ->> 'sex' END,
        CASE WHEN rooms.status = 'waiting' THEN rooms.owner ->> 'name' END,
        CASE WHEN rooms.status = 'waiting' THEN rooms.owner ->> 'profile' END
    FROM rooms
    ORDER BY rooms.room_id;
$$;

REVOKE ALL ON FUNCTION public.two_shot_lobby() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.two_shot_lobby() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.two_shot_lobby() IS
    'ツーショットチャットの空室状況。部屋の ID・状態と、待機中の管制者の性別・名前・プロフィールだけを返す。書き込まない。';

-- ---------------------------------------------------------------------------
-- 保存（two_shot_commit）
-- ---------------------------------------------------------------------------
-- Edge Function が rules.ts で計算した次の状態を、次の順に確定する（全部成功するか、何もしないか）。
--   1. 部屋の行を FOR UPDATE でロックし、読んだ version と比べる。違えば何もせず 'conflict'
--   2. 評価に使った時刻と、ロック後の実時刻（clock_timestamp）で「300 秒の時間切れ」の判定が
--      食い違ったら 'conflict'（Edge が読み直して評価し直す）
--   3. 新しい入室記録があるときだけ、受付期限（作成から 10 分・未来は 60 秒）を実時刻で確かめ
--      （過ぎていれば 'expired-entry'）、トークンのハッシュの一意制約で確保する。既にあれば
--      'admission-conflict'（同じトークンの同時送信・別の部屋への転用を 1 回にする）
--   4. 状態が変わるなら version を 1 増やして書く
--   5. 会話の控えがあれば、保存後の version で書く。失敗したら例外で全体を取り消す
-- 例外（DB の障害・制約違反）は捕まえない。呼び出し全体がロールバックされ、Edge は 500 を返す。

CREATE OR REPLACE FUNCTION public.two_shot_commit(
    p_room_id text,
    p_expected_version bigint,
    p_evaluated_at_ms bigint,
    p_next_state jsonb,
    p_admission jsonb,
    p_audit jsonb
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_version bigint;
    v_state jsonb;
    v_now_ms numeric;
    v_last numeric;
    v_attempt_ms bigint;
BEGIN
    SELECT r.version, r.state INTO v_version, v_state
    FROM public.two_shot_rooms AS r
    WHERE r.room_id = p_room_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'two_shot_commit: unknown room %', p_room_id USING ERRCODE = 'P0002';
    END IF;
    IF v_version <> p_expected_version THEN
        RETURN 'conflict';
    END IF;

    -- ロックを取った後の実時刻。now() はトランザクション開始の時刻に固定されるので使わない
    v_now_ms := floor(extract(epoch FROM clock_timestamp()) * 1000);
    IF jsonb_typeof(v_state -> 'lastActivityAt') = 'number' THEN
        v_last := (v_state ->> 'lastActivityAt')::numeric;
        IF ((p_evaluated_at_ms - v_last) >= 300000) IS DISTINCT FROM ((v_now_ms - v_last) >= 300000) THEN
            RETURN 'conflict';
        END IF;
    END IF;

    IF p_admission IS NOT NULL THEN
        v_attempt_ms := (p_admission ->> 'attemptAtMs')::bigint;
        IF v_now_ms - v_attempt_ms > 600000 OR v_attempt_ms - v_now_ms > 60000 THEN
            RETURN 'expired-entry';
        END IF;
        INSERT INTO public.two_shot_admissions (token_hash, room_id, request_hash, attempt_at, member_id, result)
        VALUES (
            p_admission ->> 'tokenHash',
            p_room_id,
            p_admission ->> 'requestHash',
            to_timestamp(v_attempt_ms / 1000.0),
            (p_admission ->> 'memberId')::uuid,
            p_admission ->> 'result'
        )
        ON CONFLICT (token_hash) DO NOTHING;
        IF NOT FOUND THEN
            RETURN 'admission-conflict';
        END IF;
    END IF;

    IF p_next_state IS NOT NULL THEN
        v_version := v_version + 1;
        UPDATE public.two_shot_rooms
        SET state = p_next_state, version = v_version, updated_at = clock_timestamp()
        WHERE room_id = p_room_id;
    END IF;

    IF p_audit IS NOT NULL THEN
        IF p_next_state IS NULL THEN
            RAISE EXCEPTION 'two_shot_commit: audit requires a state change';
        END IF;
        INSERT INTO public.two_shot_audit (room_id, room_version, at, member_id, seat, name, text, ip)
        VALUES (
            p_room_id,
            v_version,
            to_timestamp((p_audit ->> 'atMs')::bigint / 1000.0),
            (p_audit ->> 'memberId')::uuid,
            (p_audit ->> 'seat')::smallint,
            p_audit ->> 'name',
            p_audit ->> 'text',
            p_audit ->> 'ip'
        );
    END IF;

    RETURN 'committed';
END;
$$;

REVOKE ALL ON FUNCTION public.two_shot_commit(text, bigint, bigint, jsonb, jsonb, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.two_shot_commit(text, bigint, bigint, jsonb, jsonb, jsonb)
    TO service_role;

COMMENT ON FUNCTION public.two_shot_commit(text, bigint, bigint, jsonb, jsonb, jsonb) IS
    'ツーショットチャットの保存。version の CAS・入室記録・会話の控えを 1 トランザクションで確定する。service_role 専用。';

-- ---------------------------------------------------------------------------
-- 定期削除（pg_cron）と監視
-- ---------------------------------------------------------------------------
-- 入室記録は 24 時間、会話の控えは 30 日を過ぎたら毎時消す（物理削除までの最大遅延は 1 時間）。
-- cron.schedule は同じ名前のジョブを上書きするので、再実行しても 1 つのまま。

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.schedule(
    'two-shot-purge-admissions',
    '17 * * * *',
    $$DELETE FROM public.two_shot_admissions WHERE attempt_at <= now() - interval '24 hours'$$
);
SELECT cron.schedule(
    'two-shot-purge-audit',
    '23 * * * *',
    $$DELETE FROM public.two_shot_audit WHERE at <= now() - interval '30 days'$$
);

-- 削除ジョブの監視用。直近 2 時間以内に成功していれば healthy。適用直後（まだ 1 回も動いていない間）は false。
-- 監視（New Relic など）は service_role でこれを定期的に呼び、false が続いたら通知する。
CREATE OR REPLACE FUNCTION public.two_shot_maintenance_health()
RETURNS TABLE (jobname text, active boolean, last_status text, last_start timestamptz, healthy boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        j.jobname::text,
        j.active,
        d.status::text,
        d.start_time,
        coalesce(j.active AND d.status = 'succeeded' AND d.start_time > now() - interval '2 hours', false)
    FROM cron.job AS j
    LEFT JOIN LATERAL (
        SELECT r.status, r.start_time
        FROM cron.job_run_details AS r
        WHERE r.jobid = j.jobid
        ORDER BY r.start_time DESC
        LIMIT 1
    ) AS d ON true
    WHERE j.jobname IN ('two-shot-purge-admissions', 'two-shot-purge-audit')
    ORDER BY j.jobname;
$$;

REVOKE ALL ON FUNCTION public.two_shot_maintenance_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.two_shot_maintenance_health() TO service_role;

-- ---------------------------------------------------------------------------
-- 自己検証（ここで落ちれば権限か一覧の規則が壊れている）
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    t text;
    r text;
    p text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        FOREACH t IN ARRAY ARRAY['public.two_shot_rooms', 'public.two_shot_admissions',
                                 'public.two_shot_audit', 'public.two_shot_audit_recent'] LOOP
            FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
                IF has_table_privilege(r, t, p) THEN
                    RAISE EXCEPTION 'self-check: % has % on %', r, p, t;
                END IF;
            END LOOP;
        END LOOP;
        IF has_function_privilege(r, 'public.two_shot_commit(text, bigint, bigint, jsonb, jsonb, jsonb)', 'EXECUTE') THEN
            RAISE EXCEPTION 'self-check: % can execute two_shot_commit', r;
        END IF;
        IF has_function_privilege(r, 'public.two_shot_maintenance_health()', 'EXECUTE') THEN
            RAISE EXCEPTION 'self-check: % can execute two_shot_maintenance_health', r;
        END IF;
        IF NOT has_function_privilege(r, 'public.two_shot_lobby()', 'EXECUTE') THEN
            RAISE EXCEPTION 'self-check: % cannot execute two_shot_lobby', r;
        END IF;
    END LOOP;
    IF NOT has_table_privilege('service_role', 'public.two_shot_rooms', 'UPDATE')
        OR NOT has_function_privilege('service_role', 'public.two_shot_commit(text, bigint, bigint, jsonb, jsonb, jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'self-check: service_role lacks privileges';
    END IF;
    IF (SELECT count(*) FROM pg_proc WHERE oid = 'public.two_shot_lobby()'::regprocedure
            AND array_length(proallargtypes, 1) = 5) <> 1 THEN
        RAISE EXCEPTION 'self-check: two_shot_lobby must return 5 columns';
    END IF;
    IF (SELECT count(*) FROM cron.job WHERE jobname IN ('two-shot-purge-admissions', 'two-shot-purge-audit')) <> 2 THEN
        RAISE EXCEPTION 'self-check: purge jobs are not scheduled';
    END IF;
END
$$;

-- 一覧の規則の境界。書き換えはサブトランザクションの中で行い、最後に取り消す。
DO $$
DECLARE
    now_ms bigint := floor(extract(epoch FROM now()) * 1000);
    owner jsonb := '{"memberId":"00000000-0000-4000-8000-000000000001","tokenHash":"x","name":"alice",'
                   '"sex":"F","profile":"hi","ip":null,"ua":"ua"}'::jsonb;
    got text;
    msg text;
BEGIN
    BEGIN
        UPDATE public.two_shot_rooms SET state = jsonb_build_object(
            'lastActivityAt', now_ms - 299000, 'seats', jsonb_build_array(owner, NULL), 'lines', '[]'::jsonb)
        WHERE room_id = '01';
        UPDATE public.two_shot_rooms SET state = jsonb_build_object(
            'lastActivityAt', now_ms - 300000, 'seats', jsonb_build_array(owner, NULL), 'lines', '[]'::jsonb)
        WHERE room_id = '02';
        UPDATE public.two_shot_rooms SET state = jsonb_build_object(
            'lastActivityAt', now_ms, 'seats', jsonb_build_array(owner, owner), 'lines', '[]'::jsonb)
        WHERE room_id = '03';

        SELECT status || '/' || coalesce(name, '-') INTO got FROM public.two_shot_lobby() WHERE room_id = '01';
        IF got <> 'waiting/alice' THEN RAISE EXCEPTION 'self-check: 299s should be waiting (%)', got; END IF;
        SELECT status || '/' || coalesce(name, '-') INTO got FROM public.two_shot_lobby() WHERE room_id = '02';
        IF got <> 'empty/-' THEN RAISE EXCEPTION 'self-check: 300s should be empty (%)', got; END IF;
        SELECT status || '/' || coalesce(name, '-') INTO got FROM public.two_shot_lobby() WHERE room_id = '03';
        IF got <> 'full/-' THEN RAISE EXCEPTION 'self-check: full hides the owner (%)', got; END IF;
        SELECT status INTO got FROM public.two_shot_lobby() WHERE room_id = '04';
        IF got <> 'empty' THEN RAISE EXCEPTION 'self-check: default state should be empty (%)', got; END IF;

        RAISE EXCEPTION 'two_shot_self_check_ok';
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS msg = MESSAGE_TEXT;
        IF msg <> 'two_shot_self_check_ok' THEN
            RAISE EXCEPTION '%', msg;
        END IF;
    END;
END
$$;
