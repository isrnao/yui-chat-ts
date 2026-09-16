-- 追加のみ。公開SELECTの厳格化はクライアント更新後にoperationsで行う。
CREATE SCHEMA IF NOT EXISTS search_api;
REVOKE ALL ON SCHEMA search_api FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'chat_search_reader') THEN
    CREATE ROLE chat_search_reader LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 4;
  END IF;
END $$;
-- パスワードはSecret運用で設定する。マイグレーションには書かない。
ALTER ROLE chat_search_reader SET statement_timeout = '1s';
ALTER ROLE chat_search_reader SET idle_in_transaction_session_timeout = '5s';
GRANT USAGE ON SCHEMA public, search_api TO chat_search_reader;
GRANT SELECT (uuid, room_id, name, message, time, deleted, system)
  ON public.chats TO chat_search_reader;
-- 既存のpermissive USING(true)が残る移行期間も、このロールには削除を隠す。
CREATE POLICY search_active_only ON public.chats AS RESTRICTIVE
  FOR SELECT TO chat_search_reader USING (deleted = false);
CREATE POLICY search_read ON public.chats
  FOR SELECT TO chat_search_reader USING (deleted = false);

-- 表示名は本人確認ではない。従来の匿名clear/cutの対象条件を維持する。
-- 削除後SELECTを許可せずUPDATEできる狭いdefiner RPC。本文を返さない。
CREATE FUNCTION public.clear_chat_logs(p_room_id text, p_name text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_room_id IS NULL OR length(p_room_id) NOT BETWEEN 1 AND 80
     OR (p_name IS NOT NULL AND length(p_name) > 256) THEN
    RAISE EXCEPTION 'invalid deletion scope' USING ERRCODE = '22023';
  END IF;
  UPDATE public.chats SET deleted = true
  WHERE room_id = p_room_id AND deleted = false
    AND (p_name IS NULL OR name = p_name);
END $$;
REVOKE ALL ON FUNCTION public.clear_chat_logs(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_chat_logs(text, text) TO anon, authenticated;
