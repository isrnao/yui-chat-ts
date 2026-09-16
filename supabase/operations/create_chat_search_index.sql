-- psql -v ON_ERROR_STOP=1 -f ...。BEGINやマイグレーションtransactionに含めない。
-- 拡張のアップグレードは別途判断。既にある拡張は移動しない。
CREATE EXTENSION IF NOT EXISTS pgroonga WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO chat_search_reader;
CREATE INDEX CONCURRENTLY idx_chats_message_pgroonga_active
  ON public.chats USING pgroonga (message) WHERE deleted = false;
SELECT indexrelid::regclass, indisvalid, indisready FROM pg_index
 WHERE indexrelid = 'public.idx_chats_message_pgroonga_active'::regclass;
