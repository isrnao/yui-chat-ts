-- two_shot_maintenance_health() が、削除された（cron.job にない）ジョブの行を返さない問題を直す。
-- spec: .kiro/specs/two-shot-chat/design.md §7「削除ジョブの監視」
--
-- 以前の版は cron.job にあるジョブだけを返したので、ジョブが消えると healthy = false の行も出ず、
-- 「false が続いたら通知する」監視では削除の停止を見逃した。期待する 2 つのジョブ名を起点にし、
-- ジョブがなければ active = false・last_status = 'missing'・healthy = false の行を返す。
--
-- 20260924000000_two_shot.sql を適用済みのデータベースには、この SQL だけを流せばよい（関数の置き換えだけで、
-- 表・データ・削除ジョブには触れない）。何度流しても同じ結果になる。

CREATE OR REPLACE FUNCTION public.two_shot_maintenance_health()
RETURNS TABLE (jobname text, active boolean, last_status text, last_start timestamptz, healthy boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        expected.jobname,
        coalesce(j.active, false),
        CASE WHEN j.jobid IS NULL THEN 'missing' ELSE d.status::text END,
        d.start_time,
        coalesce(j.active AND d.status = 'succeeded' AND d.start_time > now() - interval '2 hours', false)
    FROM (VALUES ('two-shot-purge-admissions'), ('two-shot-purge-audit')) AS expected (jobname)
    LEFT JOIN cron.job AS j ON j.jobname = expected.jobname
    LEFT JOIN LATERAL (
        SELECT r.status, r.start_time
        FROM cron.job_run_details AS r
        WHERE r.jobid = j.jobid
        ORDER BY r.start_time DESC
        LIMIT 1
    ) AS d ON true
    ORDER BY expected.jobname;
$$;

REVOKE ALL ON FUNCTION public.two_shot_maintenance_health() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.two_shot_maintenance_health() TO service_role;

COMMENT ON FUNCTION public.two_shot_maintenance_health() IS
    'ツーショットチャットの削除ジョブの状態。期待する 2 つのジョブを必ず返し、消えたジョブも healthy = false にする。service_role 専用。';
