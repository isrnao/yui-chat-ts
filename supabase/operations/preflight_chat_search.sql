-- 読取のみ。検索語・本文・秘密値は取得しない。
SHOW server_version;
SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name='pgroonga';
SELECT e.extversion, n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgroonga';
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_policies WHERE schemaname='public' AND tablename='chats';
SELECT c.relname, i.indisvalid, i.indisready FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='public.chats'::regclass;
SELECT pg_database_size(current_database()) AS database_bytes;
SELECT reltuples::bigint AS estimated_rows FROM pg_class WHERE oid='public.chats'::regclass;
