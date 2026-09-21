-- 部屋ごとの発言ランキングを返すビュー chat_ranking を追加する。
--
-- 背景:
--   ランキング画面はこれまで、チャットログ表示用に読み込んだ直近最大 100 件を
--   クライアント側で名前ごとに数えていた。そのため 100 件より前にしか発言していない
--   ユーザーは載らず、発言回数も「直近 100 件中の回数」にとどまっていた。
--
--   全件をクライアントへ送って数えると転送量が総発言数に比例する。PostgREST の
--   集計機能 (count() / max()) は anon に任意の集計を許すことになるうえ、
--   「最終発言の色・ホスト」を取る集計関数が無い。そこで集計をビューに閉じ込め、
--   フロントからは通常のテーブルと同じく .from('chat_ranking') で読む。
--
-- 集計範囲:
--   - system 発言 (入退室など) は除外する。system 列は NULL を許すので `is not true`
--   - deleted は見ない。論理削除 (「消す」/ 全消去) された発言も発言回数に数える
--
-- 権限:
--   security_invoker = true で、呼び出したロール (anon) の権限で chats を読む。
--   anon は chats の列レベル GRANT (20260830000000) で ip を読めないため、
--   このビューを経由しても生 IP は出ない。ホストは ip_masked から取る。

CREATE OR REPLACE VIEW public.chat_ranking
WITH (security_invoker = true) AS
SELECT
  room_id,
  name,
  -- PostgREST では count() が集計関数の構文なので、列名は count を避ける
  count(*)::integer                               AS post_count,
  max("time")                                     AS last_time,
  -- 色とホストは最終発言のものを採用する (uuid は UUIDv7 なので時系列順)
  (array_agg(color     ORDER BY uuid DESC))[1]    AS color,
  (array_agg(ip_masked ORDER BY uuid DESC))[1]    AS host
FROM public.chats
WHERE system IS NOT TRUE
GROUP BY room_id, name;

-- ALTER DEFAULT PRIVILEGES で anon に ALL が付くため、一度剥がして SELECT だけにする。
-- (集計ビューは自動更新可能ではないので書き込みはどのみち失敗するが、意図を明示する)
REVOKE ALL ON public.chat_ranking FROM anon, authenticated;
GRANT SELECT ON public.chat_ranking TO anon, authenticated;

COMMENT ON VIEW public.chat_ranking IS
  '部屋ごとの発言ランキング。system 発言を除き、deleted は問わず全期間を集計する。色・ホストは最終発言のもの。';
