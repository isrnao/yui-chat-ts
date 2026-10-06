-- 部屋の一覧をサーバーに持ち、chats.room_id を確かめる（Issue #178、docs/SERVER_SIDE_LOGIC_REFACTORING.md S4）。
--
-- 正は src/features/chat/rooms.ts。行は rooms.ts から作り、src/features/chat/roomsTable.test.ts が
-- rooms.ts と下の INSERT の ID・カテゴリ・enabled が一致することを確かめる（部屋を足すときはここにも足す）。
-- 部屋の題名・紹介文・カテゴリ名はフロントエンドに残す（SSG とプリレンダがビルド時に使うため）。
--
-- 確かめ方:
--   - chats.room_id の外部キー（NOT VALID）: 知らない ID の新しい行を止める（23503）
--   - トリガー chats_room_enabled: enabled = false の部屋への新しい行を止める（SQLSTATE YC001）
--   save-chat はどちらも 400 invalid_room_id にする。
--   triage の対象は rooms.triage で決める（save-chat は保存の応答に rooms(triage) を埋め込んで受け取るので、往復は増えない）。
--
-- 既存の行の知らない ID を数え、0 件（または rooms に足した後）に別のマイグレーションで VALIDATE する:
--
--   SELECT c.room_id, count(*) FROM public.chats AS c
--   LEFT JOIN public.rooms AS r ON r.id = c.room_id
--   WHERE r.id IS NULL GROUP BY c.room_id;
--
-- 性能: 挿入ごとに 82 行の表の主キーを引く（外部キーとトリガーで 2 回。常にメモリにある）。外部キーは rooms の行に
-- KEY SHARE、トリガーは SHARE のロックを取る。SHARE 同士は競合しないので発言どうしは待たない。rooms はほぼ更新しないので
-- 閉じる更新との待ちもまず起きない。

CREATE TABLE public.rooms (
    id text PRIMARY KEY,
    category text NOT NULL,
    enabled boolean NOT NULL,
    triage boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE public.rooms IS
    '部屋の一覧（正は src/features/chat/rooms.ts）。chats.room_id の外部キー先。enabled = false の部屋には発言できない。triage = true の部屋の発言は save-chat が JEV で振り分ける。';

INSERT INTO public.rooms (id, category, enabled, triage) VALUES
    ('superbeginner', 'beginner', true, false),
    ('hajime', 'beginner', true, false),
    ('ofall', 'beginner', true, false),
    ('yume', 'beginner', true, false),
    ('elementary', 'student', true, false),
    ('juniorhighschool', 'student', true, false),
    ('juniorhighschool3', 'student', true, false),
    ('highschool', 'student', true, false),
    ('daigaku', 'student', true, false),
    ('10generations', 'generation', true, false),
    ('20generations', 'generation', true, false),
    ('30generations', 'generation', true, false),
    ('umaimise', 'daily', true, false),
    ('osare', 'daily', true, false),
    ('news', 'daily', true, false),
    ('jinsei', 'daily', true, false),
    ('anime', 'anime', true, false),
    ('reborn', 'anime', true, false),
    ('monhan', 'anime', true, false),
    ('rozen', 'anime', true, false),
    ('game', 'game', true, false),
    ('pazudora', 'game', true, false),
    ('3ds', 'game', true, false),
    ('natsuyasumi', 'season', true, false),
    ('hanabi-taikai', 'season', true, false),
    ('haruyasumi', 'season', true, false),
    ('area_kantoh', 'area', true, false),
    ('area_hok_touho', 'area', true, false),
    ('area_toukai', 'area', true, false),
    ('area_kansai', 'area', true, false),
    ('area_chu_shi', 'area', true, false),
    ('area_kyu_oki', 'area', true, false),
    ('music', 'hobby', true, false),
    ('dance', 'hobby', true, false),
    ('travel', 'hobby', true, false),
    ('darts', 'hobby', true, false),
    ('tabletennis', 'hobby', true, false),
    ('omikuji', 'meruhen', true, false),
    ('mico', 'meruhen', true, false),
    ('puchi', 'meruhen', true, false),
    ('gyamikuji', 'meruhen', true, false),
    ('meruhen1', 'meruhen', true, false),
    ('meruhen2', 'meruhen', true, false),
    ('colorful', 'meruhen', true, false),
    ('hoshi', 'meruhen', true, false),
    ('karaoke', 'offkai', true, false),
    ('karaoke2', 'offkai', true, false),
    ('sports', 'offkai', true, false),
    ('hoshizora', 'offkai', true, false),
    ('ohirune', 'offkai', true, false),
    ('kakifry', 'offkai', true, false),
    ('vip', 'historic', true, false),
    ('hajime-old', 'historic', true, false),
    ('mattari', 'historic', true, false),
    ('wai2', 'historic', true, false),
    ('joren', 'historic', true, false),
    ('shouchu', 'historic', true, false),
    ('20dai', 'historic', true, false),
    ('30dai', 'historic', true, false),
    ('battle', 'historic', true, false),
    ('2shot', 'historic', true, false),
    ('com_sb', 'admin', true, true),
    ('durarara', 'chanari', true, false),
    ('vocaloid', 'chanari', true, false),
    ('hetaria', 'chanari', true, false),
    ('gintama', 'chanari', true, false),
    ('inazuma11', 'chanari', true, false),
    ('tenipri', 'chanari', true, false),
    ('touhou', 'chanari', true, false),
    ('basara', 'chanari', true, false),
    ('inazuma11go', 'chanari', true, false),
    ('bakatesu', 'chanari', true, false),
    ('working', 'chanari', true, false),
    ('akb48', 'chanari', true, false),
    ('majutu', 'chanari', true, false),
    ('bleach', 'chanari', true, false),
    ('kuroshitsuji', 'chanari', true, false),
    ('keion', 'chanari', true, false),
    ('dgrayman', 'chanari', true, false),
    ('haruhi', 'chanari', true, false),
    ('railgun', 'chanari', true, false),
    ('all', 'all', true, false);

-- 一覧は公開してよい（Android 版などが読める）。書くのは service_role とマイグレーションだけ
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public-select" ON public.rooms FOR SELECT USING (true);
REVOKE ALL ON public.rooms FROM anon, authenticated;
GRANT SELECT ON public.rooms TO anon, authenticated;

ALTER TABLE public.chats
    ADD CONSTRAINT chats_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms (id) NOT VALID;

-- 閉じた部屋への新しい発言を止める。外部キーでは enabled を見られないのでトリガーで行う。
-- 部屋の行を FOR SHARE で読み、enabled = false への更新と発言の INSERT を直列化する（ただの SELECT だと、
-- 閉じる更新のコミット前の true を読んだ発言がそのままコミットできる。外部キーの KEY SHARE は非キー列の
-- 更新と競合しないので、これだけでは防げない）。知らない部屋は外部キーが 23503 で止める
CREATE OR REPLACE FUNCTION public.chats_room_enabled() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
BEGIN
  SELECT enabled INTO v_enabled FROM public.rooms WHERE id = NEW.room_id FOR SHARE;
  IF v_enabled IS FALSE THEN
    RAISE EXCEPTION 'room % is disabled', NEW.room_id USING ERRCODE = 'YC001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.chats_room_enabled() FROM public;

CREATE TRIGGER chats_room_enabled
    BEFORE INSERT ON public.chats
    FOR EACH ROW EXECUTE FUNCTION public.chats_room_enabled();
