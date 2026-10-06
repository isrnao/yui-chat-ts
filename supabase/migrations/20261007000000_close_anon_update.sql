-- anon / authenticated から chats の UPDATE を外す（Issue #179 の締め、docs/SERVER_SIDE_LOGIC_REFACTORING.md S7）。
--
-- clear と [消す] は SQL 関数 clear_my_chats（書いた端末の鍵で照合、SECURITY DEFINER）に移った
-- （20261006030000_insert_chat_and_clear_my_chats.sql）。名前と部屋だけで他人の発言も消せた PostgREST の PATCH の
-- 経路をここで閉じる。
--
-- 適用の時期: clear_my_chats を使う Web を配信してから 1 日以上たってから（開いたままの古いタブが PATCH で消すため。
-- 適用後、古いタブの clear は権限エラーになる。読み込み直せば新しいコードになる）。

DROP POLICY IF EXISTS "public-update" ON public.chats;

REVOKE UPDATE ON TABLE public.chats FROM anon, authenticated;
