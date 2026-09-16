-- 先にSEARCH_ENABLED=falseで新規検索を止める。RLSは戻さない。
-- 実行中トランザクションの終了を待つ場合がある。
DROP INDEX CONCURRENTLY IF EXISTS public.idx_chats_message_pgroonga_active;
-- 拡張自体や他用途の索引は削除しない。
