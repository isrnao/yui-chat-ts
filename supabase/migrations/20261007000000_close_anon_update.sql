-- anon / authenticated から chats の UPDATE を外す（Issue #179 の締め、docs/SERVER_SIDE_LOGIC_REFACTORING.md S7）。
--
-- clear と [消す] は SQL 関数 clear_my_chats（書いた端末の鍵で照合、SECURITY DEFINER）に移った
-- （20261006030000_insert_chat_and_clear_my_chats.sql）。名前と部屋だけで他人の発言も消せた PostgREST の PATCH の
-- 経路をここで閉じる。
--
-- 配信の手順は docs/save-chat-edge-function.md の「配信の手順」を参照（サービスを閉塞している間にまとめて適用する）。

DROP POLICY IF EXISTS "public-update" ON public.chats;

-- テーブルの権限を取り消すと、その表の列の権限（baseline の GRANT UPDATE ("deleted")）も一緒に取り消される
-- （PostgreSQL の REVOKE の仕様）。supabase/tests/chats.sql が列の権限も残っていないことを確かめる
REVOKE UPDATE ON TABLE public.chats FROM anon, authenticated;
