-- 発言の通報（.kiro/specs/android-native-app design.md §7.6、Task 0.6、R12.2〜R12.4・R21.4）。
--
-- Edge Function report-chat が service_role で insert_chat_report を呼んで保存する。表は RLS が有効でポリシーが
-- 無く、anon / authenticated からは読み書きできない。運営は service_role（ダッシュボード）で確かめ、status を進める。
-- 通報の本文と対象の発言は公開の場所（GitHub の Issue など）に出さない。

CREATE TABLE public.chat_reports (
    id uuid PRIMARY KEY DEFAULT public.uuidv7_sub_ms(),
    chat_uuid uuid NOT NULL,
    room_id text,
    -- 理由の一覧は supabase/functions/report-chat/schema.ts の REPORT_REASONS と同じにする
    reason text NOT NULL CHECK (
        reason IN ('spam', 'harassment', 'sexual', 'child_safety', 'personal_info', 'other')
    ),
    detail text NOT NULL DEFAULT '' CHECK (char_length(detail) <= 500),
    -- 通報の時点の発言（後で clear されても残す）: name / message / time / ip_masked / room_id / deleted
    snapshot jsonb NOT NULL,
    -- 通報した端末の鍵の SHA-256（insert_chat と同じ author_key_hash。形の合わない鍵は NULL）
    reporter_author_key_hash bytea,
    ip text NOT NULL DEFAULT '',
    ua text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'rejected')),
    handled_at timestamptz,
    handled_note text
);

CREATE INDEX idx_chat_reports_created_at ON public.chat_reports (created_at);
CREATE INDEX idx_chat_reports_ip_created_at ON public.chat_reports (ip, created_at);
CREATE INDEX idx_chat_reports_key_created_at ON public.chat_reports (reporter_author_key_hash, created_at);
CREATE INDEX idx_chat_reports_open ON public.chat_reports (created_at) WHERE status = 'open';

ALTER TABLE public.chat_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_reports FROM anon, authenticated;

COMMENT ON TABLE public.chat_reports IS
    '発言の通報。report-chat（service_role）だけが書く。Realtime の publication に入れないこと。';

-- 通報を 1 件保存する。同じ IP と同じ端末の鍵から、直近 1 時間に p_limit 件以上あれば保存しない。
-- 戻り値: status = ok（report_id に id）/ not_found（発言が無い）/ rate_limited
CREATE OR REPLACE FUNCTION public.insert_chat_report(
    p_chat_uuid uuid,
    p_reason text,
    p_detail text,
    p_author_key text,
    p_ip text,
    p_ua text,
    p_limit integer DEFAULT 10
) RETURNS TABLE (status text, report_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_hash bytea := public.author_key_hash(p_author_key);
    v_chat record;
    v_recent integer;
    v_id uuid;
BEGIN
    SELECT c.name, c.message, c.time, c.ip_masked, c.room_id, c.deleted
      INTO v_chat
      FROM public.chats c
     WHERE c.uuid = p_chat_uuid;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_found'::text, NULL::uuid;
        RETURN;
    END IF;

    -- 同じ IP（または同じ鍵）からの同時の通報で数え漏らさないよう、IP ごとに順番にする
    PERFORM pg_advisory_xact_lock(hashtextextended('chat_reports:' || coalesce(nullif(p_ip, ''), encode(v_hash, 'hex'), ''), 0));

    SELECT count(*) INTO v_recent
      FROM public.chat_reports r
     WHERE r.created_at > now() - interval '1 hour'
       AND ((p_ip <> '' AND r.ip = p_ip) OR (v_hash IS NOT NULL AND r.reporter_author_key_hash = v_hash));
    IF v_recent >= p_limit THEN
        RETURN QUERY SELECT 'rate_limited'::text, NULL::uuid;
        RETURN;
    END IF;

    INSERT INTO public.chat_reports (chat_uuid, room_id, reason, detail, snapshot, reporter_author_key_hash, ip, ua)
    VALUES (
        p_chat_uuid,
        v_chat.room_id,
        p_reason,
        coalesce(p_detail, ''),
        jsonb_build_object(
            'name', v_chat.name,
            'message', v_chat.message,
            'time', v_chat.time,
            'ip_masked', v_chat.ip_masked,
            'room_id', v_chat.room_id,
            'deleted', v_chat.deleted
        ),
        v_hash,
        coalesce(p_ip, ''),
        coalesce(p_ua, '')
    )
    RETURNING id INTO v_id;
    RETURN QUERY SELECT 'ok'::text, v_id;
END
$$;

REVOKE ALL ON FUNCTION public.insert_chat_report(uuid, text, text, text, text, text, integer)
    FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_chat_report(uuid, text, text, text, text, text, integer) TO service_role;
