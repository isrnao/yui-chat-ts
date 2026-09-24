-- ツーショットチャットの部屋を 12 部屋（01〜12）にする。
-- spec: .kiro/specs/two-shot-chat/requirements.md（決定事項 2026-09-24 追記: 見た目を旧お気楽チャットの待合室に合わせる）
--
-- 旧お気楽チャットのツーショットは「チャットルーム01〜12」の 12 部屋だった。rules.ts の ROOM_IDS と同じ数の
-- 部屋の行を用意する。既存の 01〜10 には触れない（ON CONFLICT DO NOTHING）ので、何度流しても同じ結果になる。
--
-- 適用順序: この SQL → Edge Function two-shot の再デプロイ（ROOM_IDS が 12 部屋の版）→ 画面のデプロイ。
-- 画面が先に 11・12 を出すと、Edge が未知の部屋として断る（画面は通信の失敗 E12 を出す）。

INSERT INTO public.two_shot_rooms (room_id)
    SELECT to_char(n, 'FM00') FROM generate_series(11, 12) AS n
    ON CONFLICT DO NOTHING;

-- 自己検証: 部屋は 01〜12 の 12 行
DO $$
BEGIN
    IF (SELECT count(*) FROM public.two_shot_rooms WHERE room_id ~ '^(0[1-9]|1[0-2])$') <> 12 THEN
        RAISE EXCEPTION 'self-check: two_shot_rooms should have rooms 01-12';
    END IF;
END
$$;
