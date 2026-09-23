-- トップページの部屋ごとの参加人数を返す RPC room_participant_counts を追加する。
--
-- 背景:
--   トップの参加人数は、直近 6 時間の発言を最大 5000 行クライアントへ送り、部屋ごとの
--   ユニーク発言者数を数えていた。転送量が発言の件数に比例し、5000 行を超えると数え漏れる。
--   集計をサーバーで行い、部屋の数ぶんの行だけを返す
--   （.kiro/specs/react-2026-refactoring Requirement 14）。
--
-- 集計規則（src/features/top/api/roomCountsApi.ts の aggregateCountsFromRows と同じ）:
--   - 論理削除された発言は除く（deleted = false）
--   - since_ms 以降の発言だけ。ただし 24 時間より前は見ない（下の「負荷の上限」）
--   - system 発言と管理人の発言（metadata.kind = 'admin'）を除く
--   - 名前が空の発言は除く
--   - 一覧に出す部屋だけに絞るのはクライアント側（rooms.ts の getListableRoomIds）
--
-- 負荷の上限:
--   since_ms は呼び出し元（anon）が自由に渡せる。0 を渡されると全期間の発言を集計してしまうので、
--   現在から 24 時間前より古い値は 24 時間前に切り上げる。トップが使う窓は 6 時間。
--   以前の行取得は 5000 行で打ち切られていたので、それに代わる上限になる。
--
-- 権限:
--   SECURITY INVOKER なので、呼び出したロール (anon) の権限で chats を読む。
--   使う列（room_id / name / time / system / metadata / deleted）は anon が SELECT できる列。
--
-- 再実行:
--   CREATE OR REPLACE と IF NOT EXISTS なので、SQL Editor から何度流しても同じ状態になる。

-- 直近の発言を時刻で絞るための部分インデックス。
-- 集計に使う列を INCLUDE して、テーブル本体を読む回数を減らす
CREATE INDEX IF NOT EXISTS idx_chats_recent_speakers
    ON public.chats ("time")
    INCLUDE (room_id, name)
    WHERE deleted = false AND system IS NOT TRUE;

CREATE OR REPLACE FUNCTION public.room_participant_counts(since_ms bigint)
RETURNS TABLE (room_id text, participants integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.room_id, count(DISTINCT c.name)::integer AS participants
  FROM public.chats AS c
  WHERE c.deleted = false
    AND c."time" >= greatest(
      since_ms,
      (extract(epoch from now()) * 1000)::bigint - 24 * 60 * 60 * 1000
    )
    AND c.system IS NOT TRUE
    AND coalesce(c.metadata->>'kind', '') <> 'admin'
    AND coalesce(c.name, '') <> ''
  GROUP BY c.room_id
$$;

REVOKE ALL ON FUNCTION public.room_participant_counts(bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.room_participant_counts(bigint) TO anon, authenticated;

COMMENT ON FUNCTION public.room_participant_counts(bigint) IS
  'since_ms 以降（24 時間前より古い値は 24 時間前に切り上げる）の部屋ごとのユニーク発言者数。論理削除・system 発言・管理人の発言・空の名前を除く。トップページの参加人数に使う。';
