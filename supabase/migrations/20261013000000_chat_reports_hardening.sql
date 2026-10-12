-- 通報の受け付けを固くする（PR #218 のレビュー）。20261012000000_chat_reports.sql の後に流す。
--
-- - 制限に使う IP（rate_ip）を、記録のための IP（ip。x-forwarded-for の先頭で、送る側が付けられる）と分ける。rate_ip は
--   report-chat が REPORT_TRUSTED_IP_HEADER で決めた信頼できる位置から取る。未設定なら空で、IP では数えない
-- - 全体の上限（1 時間に p_global_limit 件）。IP と端末の鍵を変えながら送られても、ここで止まる
-- - 同じ通報者（端末の鍵か rate_ip）が同じ発言をもう一度通報したら、保存せずに前の通報の id を返す（duplicate）
-- - その発言への、その理由の最初の通報か（first_for_chat）を返す。child_safety のアラートは最初の 1 件だけにする
-- - 数えるところを 1 つのロックで順番にする（以前は IP ごとのロックで、鍵の数え方と合っていなかった）
-- - IP・UA は 90 日で空にする（pg_cron。発言の写しと理由は残す）

ALTER TABLE public.chat_reports ADD COLUMN rate_ip text NOT NULL DEFAULT '';

DROP INDEX IF EXISTS public.idx_chat_reports_ip_created_at;
CREATE INDEX idx_chat_reports_rate_ip_created_at ON public.chat_reports (rate_ip, created_at) WHERE rate_ip <> '';
CREATE INDEX idx_chat_reports_chat_uuid ON public.chat_reports (chat_uuid);

DROP FUNCTION IF EXISTS public.insert_chat_report(uuid, text, text, text, text, text, integer);

-- 戻り値: status = ok（report_id に id）/ duplicate（report_id に前の通報の id）/ not_found（発言が無い）/
-- rate_limited（同じ通報者の上限）/ rate_limited_global（全体の上限）
CREATE FUNCTION public.insert_chat_report(
    p_chat_uuid uuid,
    p_reason text,
    p_detail text,
    p_author_key text,
    p_ip text,
    p_ua text,
    p_rate_ip text DEFAULT '',
    p_limit integer DEFAULT 10,
    p_global_limit integer DEFAULT 300
) RETURNS TABLE (status text, report_id uuid, first_for_chat boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_hash bytea := public.author_key_hash(p_author_key);
    v_rate_ip text := coalesce(p_rate_ip, '');
    v_chat record;
    v_existing uuid;
    v_first boolean;
    v_id uuid;
BEGIN
    SELECT c.name, c.message, c.time, c.ip_masked, c.room_id, c.deleted
      INTO v_chat
      FROM public.chats c
     WHERE c.uuid = p_chat_uuid;
    IF NOT FOUND THEN
        RETURN QUERY SELECT 'not_found'::text, NULL::uuid, false;
        RETURN;
    END IF;

    -- 通報は少ないので、数えて入れるところを 1 つのロックで順番にする（同時の要求で数え漏らさない）
    PERFORM pg_advisory_xact_lock(hashtextextended('chat_reports', 0));

    SELECT r.id INTO v_existing
      FROM public.chat_reports r
     WHERE r.chat_uuid = p_chat_uuid
       AND ((v_hash IS NOT NULL AND r.reporter_author_key_hash = v_hash)
            OR (v_rate_ip <> '' AND r.rate_ip = v_rate_ip))
     ORDER BY r.created_at DESC
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
        RETURN QUERY SELECT 'duplicate'::text, v_existing, false;
        RETURN;
    END IF;

    IF (SELECT count(*)
          FROM public.chat_reports r
         WHERE r.created_at > now() - interval '1 hour'
           AND ((v_rate_ip <> '' AND r.rate_ip = v_rate_ip)
                OR (v_hash IS NOT NULL AND r.reporter_author_key_hash = v_hash))) >= p_limit THEN
        RETURN QUERY SELECT 'rate_limited'::text, NULL::uuid, false;
        RETURN;
    END IF;

    IF (SELECT count(*) FROM public.chat_reports r WHERE r.created_at > now() - interval '1 hour') >= p_global_limit THEN
        RETURN QUERY SELECT 'rate_limited_global'::text, NULL::uuid, false;
        RETURN;
    END IF;

    v_first := NOT EXISTS (
        SELECT 1 FROM public.chat_reports r WHERE r.chat_uuid = p_chat_uuid AND r.reason = p_reason
    );

    INSERT INTO public.chat_reports (chat_uuid, room_id, reason, detail, snapshot, reporter_author_key_hash, ip, ua, rate_ip)
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
        coalesce(p_ua, ''),
        v_rate_ip
    )
    RETURNING id INTO v_id;
    RETURN QUERY SELECT 'ok'::text, v_id, v_first;
END
$$;

REVOKE ALL ON FUNCTION public.insert_chat_report(uuid, text, text, text, text, text, text, integer, integer)
    FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_chat_report(uuid, text, text, text, text, text, text, integer, integer)
    TO service_role;

-- IP・UA は 90 日で空にする（毎日。発言の写し・理由・端末の鍵のハッシュは残す）。
-- cron.schedule は同じ名前のジョブを上書きするので、再実行しても 1 つのまま。
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.schedule(
    'chat-reports-clear-ip',
    '41 3 * * *',
    $$UPDATE public.chat_reports SET ip = '', ua = '', rate_ip = ''
       WHERE created_at <= now() - interval '90 days' AND (ip <> '' OR ua <> '' OR rate_ip <> '')$$
);
