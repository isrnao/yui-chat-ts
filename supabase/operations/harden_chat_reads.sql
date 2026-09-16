-- psql -v ON_ERROR_STOP=1 -f ...（新しいclear RPCを使うクライアント配信後）
BEGIN;
DROP POLICY IF EXISTS "public-select" ON public.chats;
CREATE POLICY "public-select" ON public.chats FOR SELECT TO anon, authenticated
  USING (deleted = false);
-- 別のpermissiveポリシーが存在しても削除済み行は返さない。
CREATE POLICY public_active_only ON public.chats AS RESTRICTIVE
  FOR SELECT TO anon, authenticated USING (deleted = false);
REVOKE UPDATE ON public.chats FROM anon, authenticated;
REVOKE UPDATE (deleted) ON public.chats FROM anon, authenticated;
DROP POLICY IF EXISTS "public-update" ON public.chats;
COMMIT;
