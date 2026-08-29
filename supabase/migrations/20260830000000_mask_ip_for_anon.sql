-- 生 IP を anon / authenticated から遮蔽し、表示用のマスク済み IP 列を追加する。
--
-- 目的:
--   発言末尾のレガシー互換表示 "(01/02(Wed) 20:10 219.107.106.*)" のために IP を
--   クライアントへ渡す必要がある一方、生 IP は名寄せ可能な個人情報であり anon キーで
--   読めてはならない。そこで「生 IP は残して読めなくする」「表示用のマスク済み値を
--   別列に持たせる」の 2 本立てにする。
--
-- 設計:
--   - ip        : 従来どおり save-chat Edge Function がサーバー観測値を保存する。
--                 モデレーション用の証跡。service_role からのみ読める。
--   - ip_masked : 同じく save-chat が書き込む表示用の値。IPv4 は末尾オクテット、
--                 IPv6 は上位 3 ブロックより後ろを "*" で伏せる。
--   RLS は行単位の仕組みで列は隠せないため、遮蔽は列レベル GRANT で行う。
--
-- 適用順序（重要）:
--   本マイグレーションを先に適用し、その後に `supabase functions deploy save-chat`
--   （ip_masked を書き込む版）を行うこと。逆順にすると、まだ存在しない列へ INSERT する
--   ことになり全ての発言投稿が失敗する。
--   本マイグレーションから Edge のデプロイまでの間に投稿された発言は ip_masked が空に
--   なる（IP 表示だけが出ない）。気になる場合は Edge デプロイ後に上のバックフィル
--   UPDATE をもう一度流せばよい（WHERE 条件により冪等）。

ALTER TABLE "public"."chats"
    ADD COLUMN IF NOT EXISTS "ip_masked" "text" DEFAULT ''::"text" NOT NULL;

-- 既存行のバックフィル（Edge Function / クライアントと同じマスク規則）
UPDATE "public"."chats"
SET "ip_masked" = CASE
        WHEN "ip" ~ '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$'
            THEN regexp_replace("ip", '\.\d{1,3}$', '.*')
        WHEN "ip" LIKE '%:%'
            THEN split_part("ip", ':', 1) || ':' || split_part("ip", ':', 2) || ':' ||
                 split_part("ip", ':', 3) || ':*'
        ELSE '*'
    END
WHERE "ip" <> '' AND "ip_masked" = '';

-- 列レベル権限: anon / authenticated から ip を外す。
-- baseline の GRANT ALL でテーブル全体の SELECT が付いているため、一度剥がしてから
-- 公開してよい列だけを付け直す。service_role は GRANT ALL のまま（ip も読める）。
REVOKE SELECT ON TABLE "public"."chats" FROM "anon", "authenticated";
GRANT SELECT (
    "uuid", "room_id", "name", "color", "message", "system", "email",
    "time", "metadata", "deleted", "ua", "ip_masked"
) ON TABLE "public"."chats" TO "anon", "authenticated";

COMMENT ON COLUMN "public"."chats"."ip" IS
    '発言者の実 IP（save-chat がヘッダから確定）。anon からは読めない。モデレーション用。';
COMMENT ON COLUMN "public"."chats"."ip_masked" IS
    '表示用のマスク済み IP。UI とクライアントはこの列だけを参照する。';
