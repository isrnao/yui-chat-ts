-- chats の入力の最後の防壁として CHECK 制約を足す（Issue #176、docs/SERVER_SIDE_LOGIC_REFACTORING.md S1）。
--
-- 正確な上限は save-chat（supabase/functions/save-chat/schema.ts）が持つ。ここは壊れた値と大きすぎる値を止める
-- ためのもので、上限は画面・Edge よりずっと緩い（名前 24 → 64、発言 120 grapheme → 2000 文字、メール 64 → 256）。
--
-- NOT VALID で足す:
--   既存の行は確かめず、新しい行（INSERT と UPDATE）だけに効く。ACCESS EXCLUSIVE のロックは一瞬で済む。
--   既存の行の違反を下の問い合わせで数え、0 件（または直した後）に別のマイグレーションで VALIDATE CONSTRAINT する。
--   VALIDATE は SHARE UPDATE EXCLUSIVE のロックなので、発言の保存を止めない。
--
--   SELECT
--     count(*) FILTER (WHERE NOT (char_length(name) BETWEEN 1 AND 64))                     AS name,
--     count(*) FILTER (WHERE NOT (char_length(message) BETWEEN 1 AND 2000))                AS message,
--     count(*) FILTER (WHERE NOT (char_length(color) <= 32 AND color ~ '^[#A-Za-z0-9]+$')) AS color,
--     count(*) FILTER (WHERE NOT (email IS NULL OR char_length(email) <= 256))             AS email
--   FROM public.chats;
--
-- 適用順序（20261006000000〜030000 はまとめて配信する。手順は PR #203）:
--   1. supabase db push（このマイグレーションから 20261006030000 まで）
--   2. 間を空けずに supabase functions deploy save-chat
--   新しい save-chat は rooms と insert_chat（20261006020000・030000）が無いと全部の発言が 500 になるので、
--   Function を先に出してはいけない。1 と 2 の間は古い save-chat が動いており、画面の自由入力の色（「あか」など）を
--   そのまま保存するので、その発言だけ chats_color_check に当たって 500 になる（2 の後は色を置き換えるので起きない）。

ALTER TABLE public.chats
    ADD CONSTRAINT chats_name_check CHECK (char_length(name) BETWEEN 1 AND 64) NOT VALID;

ALTER TABLE public.chats
    ADD CONSTRAINT chats_message_check CHECK (char_length(message) BETWEEN 1 AND 2000) NOT VALID;

ALTER TABLE public.chats
    ADD CONSTRAINT chats_color_check
    CHECK (char_length(color) <= 32 AND color ~ '^[#A-Za-z0-9]+$') NOT VALID;

ALTER TABLE public.chats
    ADD CONSTRAINT chats_email_check CHECK (email IS NULL OR char_length(email) <= 256) NOT VALID;
