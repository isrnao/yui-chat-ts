-- chats.metadata の形と大きさの最後の防壁（Issue #177、docs/SERVER_SIDE_LOGIC_REFACTORING.md S2）。
--
-- 許可リストは save-chat（supabase/functions/save-chat/schema.ts の sanitizeMetadata）が持ち、作り直した値は
-- 常に 2KB に収まる。ここはオブジェクトであることと大きさだけを止める。
--
-- NOT VALID で足す（既存の行は確かめない）。既存の行の違反を数えてから、別のマイグレーションで VALIDATE する:
--
--   SELECT count(*) FROM public.chats
--   WHERE NOT (metadata IS NULL OR (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 2048));
--
-- 適用順序（20261006000000〜030000 はまとめて配信する。手順は PR #203）:
--   1. supabase db push（このマイグレーションから 20261006030000 まで）
--   2. 間を空けずに supabase functions deploy save-chat
--   新しい save-chat は rooms と insert_chat（20261006020000・030000）が無いと全部の発言が 500 になるので、
--   Function を先に出してはいけない。1 と 2 の間は古い save-chat が動いており、任意の大きさの metadata を
--   そのまま保存するので、2KB を超える metadata の発言だけ 500 になる（画面が送る metadata は収まる）。

ALTER TABLE public.chats
    ADD CONSTRAINT chats_metadata_check
    CHECK (metadata IS NULL OR (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 2048))
    NOT VALID;
