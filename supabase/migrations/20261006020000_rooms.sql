-- 部屋の一覧をサーバーに持ち、chats.room_id を確かめる（Issue #178、docs/SERVER_SIDE_LOGIC_REFACTORING.md S4）。
--
-- 正は src/features/chat/rooms.ts。行は rooms.ts から作り、src/features/chat/roomsTable.test.ts が
-- rooms.ts と下の INSERT の ID・カテゴリが一致することを確かめる（部屋を足すときはここにも足す）。
-- 部屋の題名・紹介文・カテゴリ名はフロントエンドに残す（SSG とプリレンダがビルド時に使うため）。
-- category は Android 版など、サーバーから部屋の一覧を読むクライアントのために持つ。
--
-- 確かめ方: chats.room_id の外部キー（NOT VALID）が知らない ID の新しい行を止める（23503）。save-chat は
-- 400 invalid_room_id にする。triage の対象は rooms.triage で決める（insert_chat が返す）。
-- 部屋を閉じる仕組み（enabled）は持たない。今は閉じる部屋が無いので、必要になったら足す。
--
-- 既存の行の知らない ID を数え、0 件（または rooms に足した後）に別のマイグレーションで VALIDATE する:
--
--   SELECT c.room_id, count(*) FROM public.chats AS c
--   LEFT JOIN public.rooms AS r ON r.id = c.room_id
--   WHERE r.id IS NULL GROUP BY c.room_id;
--
-- 性能: 挿入ごとに 82 行の表の主キーを 1 回引く（常にメモリにある）。外部キーは rooms の行に KEY SHARE のロックを
-- 取るが、rooms はほぼ更新しないので待ちは起きない。

CREATE TABLE public.rooms (
    id text PRIMARY KEY,
    category text NOT NULL,
    triage boolean NOT NULL DEFAULT false
);

COMMENT ON TABLE public.rooms IS
    '部屋の一覧（正は src/features/chat/rooms.ts）。chats.room_id の外部キー先。triage = true の部屋の発言は save-chat が JEV で振り分ける。';

INSERT INTO public.rooms (id, category, triage) VALUES
    ('superbeginner', 'beginner', false),
    ('hajime', 'beginner', false),
    ('ofall', 'beginner', false),
    ('yume', 'beginner', false),
    ('elementary', 'student', false),
    ('juniorhighschool', 'student', false),
    ('juniorhighschool3', 'student', false),
    ('highschool', 'student', false),
    ('daigaku', 'student', false),
    ('10generations', 'generation', false),
    ('20generations', 'generation', false),
    ('30generations', 'generation', false),
    ('umaimise', 'daily', false),
    ('osare', 'daily', false),
    ('news', 'daily', false),
    ('jinsei', 'daily', false),
    ('anime', 'anime', false),
    ('reborn', 'anime', false),
    ('monhan', 'anime', false),
    ('rozen', 'anime', false),
    ('game', 'game', false),
    ('pazudora', 'game', false),
    ('3ds', 'game', false),
    ('natsuyasumi', 'season', false),
    ('hanabi-taikai', 'season', false),
    ('haruyasumi', 'season', false),
    ('area_kantoh', 'area', false),
    ('area_hok_touho', 'area', false),
    ('area_toukai', 'area', false),
    ('area_kansai', 'area', false),
    ('area_chu_shi', 'area', false),
    ('area_kyu_oki', 'area', false),
    ('music', 'hobby', false),
    ('dance', 'hobby', false),
    ('travel', 'hobby', false),
    ('darts', 'hobby', false),
    ('tabletennis', 'hobby', false),
    ('omikuji', 'meruhen', false),
    ('mico', 'meruhen', false),
    ('puchi', 'meruhen', false),
    ('gyamikuji', 'meruhen', false),
    ('meruhen1', 'meruhen', false),
    ('meruhen2', 'meruhen', false),
    ('colorful', 'meruhen', false),
    ('hoshi', 'meruhen', false),
    ('karaoke', 'offkai', false),
    ('karaoke2', 'offkai', false),
    ('sports', 'offkai', false),
    ('hoshizora', 'offkai', false),
    ('ohirune', 'offkai', false),
    ('kakifry', 'offkai', false),
    ('vip', 'historic', false),
    ('hajime-old', 'historic', false),
    ('mattari', 'historic', false),
    ('wai2', 'historic', false),
    ('joren', 'historic', false),
    ('shouchu', 'historic', false),
    ('20dai', 'historic', false),
    ('30dai', 'historic', false),
    ('battle', 'historic', false),
    ('2shot', 'historic', false),
    ('com_sb', 'admin', true),
    ('durarara', 'chanari', false),
    ('vocaloid', 'chanari', false),
    ('hetaria', 'chanari', false),
    ('gintama', 'chanari', false),
    ('inazuma11', 'chanari', false),
    ('tenipri', 'chanari', false),
    ('touhou', 'chanari', false),
    ('basara', 'chanari', false),
    ('inazuma11go', 'chanari', false),
    ('bakatesu', 'chanari', false),
    ('working', 'chanari', false),
    ('akb48', 'chanari', false),
    ('majutu', 'chanari', false),
    ('bleach', 'chanari', false),
    ('kuroshitsuji', 'chanari', false),
    ('keion', 'chanari', false),
    ('dgrayman', 'chanari', false),
    ('haruhi', 'chanari', false),
    ('railgun', 'chanari', false),
    ('all', 'all', false);

-- 一覧は公開してよい（Android 版などが読める）。書くのは service_role とマイグレーションだけ
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public-select" ON public.rooms FOR SELECT USING (true);
REVOKE ALL ON public.rooms FROM anon, authenticated;
GRANT SELECT ON public.rooms TO anon, authenticated;

ALTER TABLE public.chats
    ADD CONSTRAINT chats_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms (id) NOT VALID;
