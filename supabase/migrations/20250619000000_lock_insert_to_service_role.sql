-- chats への INSERT を service_role（= save-chat Edge Function）に限定する。
--
-- 目的:
--   ip / ua を「サーバー観測値」として詐称不可能な証跡にするため、
--   anon / authenticated からの直 INSERT を封鎖し、全 INSERT を save-chat Edge
--   Function 経由に強制する。Edge は service_role で実行され RLS をバイパスする。
--
-- 適用順序（重要）:
--   本番では先に `supabase functions deploy save-chat` を完了してから本マイグレーション
--   を適用すること。Edge 未デプロイのまま適用すると、クライアントの直 INSERT が全て
--   失敗し発言できなくなる。
--
-- 影響範囲:
--   - SELECT（public-select）/ UPDATE（public-update, 論理削除）は従来どおり anon 可。
--   - 将来の Bot 機能も service_role で INSERT するため本ポリシーと両立する。

-- 旧: 全開放の INSERT ポリシーを撤去。
DROP POLICY IF EXISTS "public-insert" ON "public"."chats";

-- 新: service_role のみ INSERT 可。anon / authenticated の直 INSERT は不可。
CREATE POLICY "service-role-insert" ON "public"."chats"
  FOR INSERT TO "service_role"
  WITH CHECK (true);
