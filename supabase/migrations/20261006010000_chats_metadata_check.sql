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
-- 適用順序: 許可リストで作り直す版の save-chat を先にデプロイする（古い版は任意の大きさの metadata を保存する）。

ALTER TABLE public.chats
    ADD CONSTRAINT chats_metadata_check
    CHECK (metadata IS NULL OR (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 2048))
    NOT VALID;
