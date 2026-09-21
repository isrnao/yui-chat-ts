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
--
-- 再実行:
--   SQL Editor から何度流しても同じ状態になるよう、ビューは DROP してから作り直す
--   (CREATE OR REPLACE VIEW は列の型・順序を変えられないため)。

-- 集計用の部分インデックス。
-- (room_id, name) の順に並んでいるので、部屋で絞った後の GROUP BY と
-- 「発言者ごとの最終発言」の取り出しがソート無しでインデックス順に読める。
-- INCLUDE で色・ホストも持たせ、テーブル本体を読まずに済むようにする (index-only scan)。
-- 並びは最終発言の判定と同じ (time DESC, uuid DESC)。
CREATE INDEX IF NOT EXISTS idx_chats_ranking
    ON public.chats (room_id, name, "time" DESC, uuid DESC)
    INCLUDE (color, ip_masked)
    WHERE system IS NOT TRUE;

DROP VIEW IF EXISTS public.chat_ranking;

CREATE VIEW public.chat_ranking
WITH (security_invoker = true) AS
SELECT
  c.room_id,
  c.name,
  c.post_count,
  l.last_time,
  l.color,
  l.host
FROM (
  -- 発言回数
  SELECT room_id, name, count(*)::integer AS post_count
  FROM public.chats
  WHERE system IS NOT TRUE
  GROUP BY room_id, name
) AS c
JOIN (
  -- 発言者ごとの最終発言 1 件。最終発言時刻・色・ホストはすべてこの 1 行から取るので、
  -- 「最終発言時刻」と「その時の色」が別の発言のものになることはない。
  -- 以前は発言者ごとに全発言の array_agg を作ってから先頭を取っていた。
  -- time が同じなら uuid (UUIDv7) の新しい方を採る
  SELECT DISTINCT ON (room_id, name)
    room_id,
    name,
    "time"    AS last_time,
    color,
    ip_masked AS host
  FROM public.chats
  WHERE system IS NOT TRUE
  ORDER BY room_id, name, "time" DESC, uuid DESC
) AS l
  ON l.room_id = c.room_id AND l.name = c.name;
-- post_count という列名は、PostgREST では count() が集計関数の構文になるため

-- ALTER DEFAULT PRIVILEGES で anon に ALL が付くため、一度剥がして SELECT だけにする。
-- (結合を含むビューは自動更新可能ではないので書き込みはどのみち失敗するが、意図を明示する)
REVOKE ALL ON public.chat_ranking FROM anon, authenticated;
GRANT SELECT ON public.chat_ranking TO anon, authenticated;

COMMENT ON VIEW public.chat_ranking IS
  '部屋ごとの発言ランキング。system 発言を除き、deleted は問わず全期間を集計する。最終発言時刻・色・ホストは最終発言 (time, uuid の降順で先頭) のもの。';
