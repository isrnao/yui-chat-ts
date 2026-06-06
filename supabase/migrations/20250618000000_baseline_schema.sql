-- Baseline migration: 現状の本番スキーマ（孤児関数の掃除後）を再現する初期マイグレーション。
--
-- 経緯:
--   このプロジェクトは当初 docs/migrations/001〜003 を手動適用（SQL Editor / psql）で運用していた。
--   001: metadata / deleted カラム + 論理削除用 UPDATE ポリシー
--   002: room_id カラム + 複数ルーム用インデックス
--   003: 検証残骸（places/visits/prefectures 系の孤児関数）の DROP
--   このファイルは上記すべてを適用し終えた「現在の DB」を 1 本で再現する正規ベースライン。
--   以後の変更（Bot 機能等）は supabase/migrations に増分として追加する。
--
-- 重要:
--   本番 DB には既にこの内容が反映済み。Supabase CLI 管理へ移行する初回は、
--   このマイグレーションを「適用済み」として登録すること（再実行で衝突させない）:
--     supabase migration repair --status applied 20250618000000
--   新規環境（ローカル / 別プロジェクト）にはそのまま流して現状を再現できる。
--
-- 保持必須: public.uuidv7_sub_ms() は chats.uuid の DEFAULT。絶対に削除しない。

-- 拡張（Supabase 標準。新規環境向けに冪等で宣言）
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

-- UUID v7 生成関数（chats.uuid の DEFAULT で使用）
CREATE OR REPLACE FUNCTION "public"."uuidv7_sub_ms"() RETURNS "uuid"
    LANGUAGE "sql"
    AS $$
 SELECT encode(
   substring(int8send(floor(t_ms)::int8) from 3) ||
   int2send((7<<12)::int2 | ((t_ms-floor(t_ms))*4096)::int2) ||
   substring(uuid_send(gen_random_uuid()) from 9 for 8)
  , 'hex')::uuid
  FROM (SELECT extract(epoch from clock_timestamp())*1000 as t_ms) s
$$;

ALTER FUNCTION "public"."uuidv7_sub_ms"() OWNER TO "postgres";

-- chats テーブル
CREATE TABLE IF NOT EXISTS "public"."chats" (
    "name" "text" NOT NULL,
    "color" "text" NOT NULL,
    "message" "text" NOT NULL,
    "system" boolean DEFAULT false,
    "email" "text",
    "time" bigint DEFAULT (EXTRACT(epoch FROM "now"()) * (1000)::numeric) NOT NULL,
    "ip" "text" DEFAULT ''::"text" NOT NULL,
    "ua" "text" DEFAULT ''::"text" NOT NULL,
    "uuid" "uuid" DEFAULT "public"."uuidv7_sub_ms"() NOT NULL,
    "metadata" "jsonb",
    "deleted" boolean DEFAULT false,
    "room_id" "text" DEFAULT 'superbeginner'::"text" NOT NULL
);

ALTER TABLE "public"."chats" OWNER TO "postgres";
COMMENT ON TABLE "public"."chats" IS 'yu-chat-ts';

-- 主キー
ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("uuid");

-- インデックス
CREATE INDEX IF NOT EXISTS "idx_chats_deleted"
    ON "public"."chats" USING "btree" ("deleted") WHERE ("deleted" = false);
CREATE INDEX IF NOT EXISTS "idx_chats_room_deleted_uuid"
    ON "public"."chats" USING "btree" ("room_id", "uuid" DESC) WHERE ("deleted" = false);
CREATE INDEX IF NOT EXISTS "idx_chats_room_uuid"
    ON "public"."chats" USING "btree" ("room_id", "uuid" DESC);

-- RLS（全開放。anon でも read/insert 可、update は論理削除遷移を許容）
ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public-insert" ON "public"."chats";
CREATE POLICY "public-insert" ON "public"."chats" FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "public-select" ON "public"."chats";
CREATE POLICY "public-select" ON "public"."chats" FOR SELECT USING (true);

DROP POLICY IF EXISTS "public-update" ON "public"."chats";
-- 論理削除（deleted=false → true）の遷移のみ許可する（docs/migrations/001 の設計に準拠）。
-- USING で未削除行のみ対象とし、WITH CHECK で deleted=true への更新だけを通す。
CREATE POLICY "public-update" ON "public"."chats"
    FOR UPDATE USING ("deleted" = false) WITH CHECK ("deleted" = true);

-- Realtime: chats を publication に追加（既に追加済みなら無視）
DO $$
BEGIN
  ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chats";
EXCEPTION
  WHEN duplicate_object THEN NULL; -- 既に追加済み
  WHEN undefined_object THEN NULL; -- publication 未作成の環境（ローカル等）はスキップ
END
$$;

-- 権限
GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

GRANT ALL ON FUNCTION "public"."uuidv7_sub_ms"() TO "anon";
GRANT ALL ON FUNCTION "public"."uuidv7_sub_ms"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."uuidv7_sub_ms"() TO "service_role";

GRANT ALL ON TABLE "public"."chats" TO "anon";
GRANT ALL ON TABLE "public"."chats" TO "authenticated";
GRANT ALL ON TABLE "public"."chats" TO "service_role";

-- UPDATE はテーブル全体ではなく deleted 列のみに限定する（docs/migrations/001 準拠）。
-- RLS の public-update ポリシーだけでなく列レベル権限でも絞ることで、deleted=true を
-- 同時指定して他カラムを書き換える経路を塞ぐ。service_role は全カラム更新可のまま。
REVOKE UPDATE ON TABLE "public"."chats" FROM "anon", "authenticated";
GRANT UPDATE ("deleted") ON TABLE "public"."chats" TO "anon", "authenticated";

-- デフォルト権限（postgres ロールが作る将来オブジェクトの既定 GRANT）
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
