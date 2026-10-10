-- 発言の保存を 1 回の RPC（insert_chat）にまとめ、書いた端末の鍵で自分の発言だけを消せるようにする
-- （Issue #179、docs/SERVER_SIDE_LOGIC_REFACTORING.md S7）。
--
-- これまで clear は、クライアントが PostgREST で「room_id と name が一致する行」に deleted = true を立てていた。
-- 条件をクライアントが決めるので、同じ名前なら他人の発言も消せた。
--
-- 新しい形:
--   - 端末（ブラウザ）ごとに 32 バイトの乱数（author key、base64url で 43 文字）を作り、save-chat に
--     x-chat-author-key ヘッダで送る
--   - save-chat は insert_chat で chats と chat_authors（鍵の SHA-256）を同じトランザクションで書く
--   - clear_my_chats は鍵のハッシュ・部屋・名前が一致し、まだ消していない行だけを消す
--
-- chat_authors を chats の列にしない理由: chats は supabase_realtime の publication に入っており、列を足すと
-- Realtime で全員に流れるおそれがある。chat_authors は publication に入れず、RLS を有効にしてポリシーを作らない。
--
-- anon の public-update と UPDATE (deleted) は 20261007000000_close_anon_update.sql で外す。
--
-- 移行前の発言は chat_authors に行が無いので、clear で消せない（D2: 名前だけの照合を残すと今の穴が残る）。

CREATE TABLE public.chat_authors (
    chat_uuid uuid PRIMARY KEY REFERENCES public.chats (uuid) ON DELETE CASCADE,
    author_key_hash bytea NOT NULL
);

CREATE INDEX idx_chat_authors_key ON public.chat_authors (author_key_hash);

ALTER TABLE public.chat_authors ENABLE ROW LEVEL SECURITY;
-- ALTER DEFAULT PRIVILEGES で anon / authenticated に ALL が付くので外す（ポリシーが無いので RLS でも読めないが、意図を明示する）
REVOKE ALL ON public.chat_authors FROM anon, authenticated;

COMMENT ON TABLE public.chat_authors IS
    '発言を書いた端末の鍵（author key）の SHA-256。clear_my_chats だけが読む。Realtime の publication に入れないこと。';

-- 鍵の形（base64url の 43 文字 = 32 バイト）。合わなければ NULL（その発言は後から消せない）
CREATE OR REPLACE FUNCTION public.author_key_hash(p_author_key text) RETURNS bytea
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_author_key ~ '^[A-Za-z0-9_-]{43}$'
      THEN extensions.digest(convert_to(p_author_key, 'UTF8'), 'sha256')
  END
$$;

REVOKE ALL ON FUNCTION public.author_key_hash(text) FROM public, anon, authenticated;

-- 送信操作ごとに保存した行（insert_chat を冪等にする）。
-- クライアントは保存に失敗したら同じ送信操作の ID（x-chat-operation-id）で再送する。サーバーがコミットした直後に
-- 通信が切れると、再送も成功して同じ発言（とおみくじなら別の運勢の巫女の返事）が 2 行ずつ残る。
-- 同じ ID の 2 回目以降は新しく入れず、1 回目に入れた行を返す。24 時間で消す（再送はその間に終わる）。
CREATE TABLE public.chat_operations (
    operation_id uuid PRIMARY KEY,
    chat_uuids uuid[] NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_operations_created_at ON public.chat_operations (created_at);

ALTER TABLE public.chat_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_operations FROM anon, authenticated;

COMMENT ON TABLE public.chat_operations IS
    '送信操作の ID ごとに insert_chat が入れた発言の uuid。再送で同じ発言を二重に入れないために使う。24 時間で消す。';

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.schedule(
    'chat-operations-purge',
    '41 * * * *',
    $$DELETE FROM public.chat_operations WHERE created_at <= now() - interval '24 hours'$$
);

-- 発言を保存する（save-chat が service_role で呼ぶ）。
--
-- p_chats: 保存する行の配列（順に入れる。uuidv7_sub_ms() は行ごとに clock_timestamp() を読むので、配列の順に並ぶ）
--   { room_id, name, color, message, system, email, metadata, ip, ua, author }
--   author = true の行だけ chat_authors に鍵のハッシュを書く（巫女の返事などサーバーが作る行は false）
-- p_author_key: x-chat-author-key の値。NULL や形の合わない値なら chat_authors に書かない
-- p_operation_id: 送信操作の ID。同じ ID で 2 回目以降に呼ばれたら、新しく入れずに 1 回目の行を返す（NULL なら毎回入れる）
--
-- 返す値: 入れた行の uuid / room_id / time / ip_masked / ua / name / color / message / system / metadata と、部屋の triage（save-chat の振り分けに使う）。
-- 部屋の確かめは chats の外部キーとトリガー chats_room_enabled が行う（23503 / YC001）。
CREATE OR REPLACE FUNCTION public.insert_chat(
  p_chats jsonb,
  p_author_key text DEFAULT NULL,
  p_operation_id uuid DEFAULT NULL
)
RETURNS TABLE (
  uuid uuid, room_id text, "time" bigint, ip_masked text, ua text,
  name text, color text, message text, system boolean, metadata jsonb, triage boolean
)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_hash bytea := public.author_key_hash(p_author_key);
  v_row jsonb;
  v_saved public.chats;
  v_uuids uuid[] := '{}';
  v_existing uuid[];
BEGIN
  IF jsonb_typeof(p_chats) IS DISTINCT FROM 'array' OR jsonb_array_length(p_chats) = 0 THEN
    RAISE EXCEPTION 'p_chats must be a non-empty array' USING ERRCODE = '22023';
  END IF;

  IF p_operation_id IS NOT NULL THEN
    -- 先に送信操作の行を入れる。同じ ID の要求が並んで来たら、後の要求は主キーの一意性の確かめで先の要求の
    -- コミットを待ち、入らなかった（ON CONFLICT）ときは先の要求が入れた行を返す（ロックを別に取らない）
    INSERT INTO public.chat_operations AS o (operation_id, chat_uuids)
    VALUES (p_operation_id, '{}')
    ON CONFLICT (operation_id) DO NOTHING;
    IF NOT FOUND THEN
      SELECT o.chat_uuids INTO v_existing FROM public.chat_operations AS o WHERE o.operation_id = p_operation_id;
      RETURN QUERY
        SELECT c.uuid, c.room_id, c."time", c.ip_masked, c.ua, c.name, c.color, c.message, c.system, c.metadata,
               coalesce(r.triage, false)
        FROM unnest(v_existing) WITH ORDINALITY AS u(id, ord)
        JOIN public.chats AS c ON c.uuid = u.id
        LEFT JOIN public.rooms AS r ON r.id = c.room_id
        ORDER BY u.ord;
      RETURN;
    END IF;
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_chats)
  LOOP
    INSERT INTO public.chats AS c (room_id, name, color, message, system, email, metadata, ip, ua)
    VALUES (
      v_row->>'room_id',
      v_row->>'name',
      v_row->>'color',
      v_row->>'message',
      coalesce((v_row->>'system')::boolean, false),
      v_row->>'email',
      CASE WHEN jsonb_typeof(v_row->'metadata') = 'object' THEN v_row->'metadata' END,
      coalesce(v_row->>'ip', ''),
      coalesce(v_row->>'ua', '')
    )
    RETURNING c.* INTO v_saved;

    IF v_hash IS NOT NULL AND coalesce((v_row->>'author')::boolean, false) THEN
      INSERT INTO public.chat_authors (chat_uuid, author_key_hash) VALUES (v_saved.uuid, v_hash);
    END IF;
    v_uuids := v_uuids || v_saved.uuid;

    uuid := v_saved.uuid;
    room_id := v_saved.room_id;
    "time" := v_saved."time";
    ip_masked := v_saved.ip_masked;
    ua := v_saved.ua;
    name := v_saved.name;
    color := v_saved.color;
    message := v_saved.message;
    system := v_saved.system;
    metadata := v_saved.metadata;
    triage := coalesce((SELECT r.triage FROM public.rooms AS r WHERE r.id = v_saved.room_id), false);
    RETURN NEXT;
  END LOOP;

  IF p_operation_id IS NOT NULL THEN
    UPDATE public.chat_operations AS o SET chat_uuids = v_uuids WHERE o.operation_id = p_operation_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_chat(jsonb, text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_chat(jsonb, text, uuid) TO service_role;

COMMENT ON FUNCTION public.insert_chat(jsonb, text, uuid) IS
    '発言を保存する（save-chat 専用、service_role）。p_chats の順に chats へ入れ、author = true の行は鍵のハッシュを chat_authors に書く。同じ p_operation_id の 2 回目以降は 1 回目の行を返す。';

-- 自分の発言を消す（clear コマンドと [消す]。anon が PostgREST の RPC で呼ぶ）。
--
-- 鍵のハッシュ・部屋・名前が一致し、まだ消していない行だけに deleted = true を立て、消した行の uuid を返す
-- （件数は配列の長さ。uuid を返すのは、画面が手元のログから同じ行だけを外せるようにするため）。
-- 実行計画: chat_authors (author_key_hash) のインデックス → 主キーで chats → 部屋・名前・deleted の確認。
-- その端末の発言の数だけ読む。
CREATE OR REPLACE FUNCTION public.clear_my_chats(p_room_id text, p_name text, p_author_key text)
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH cleared AS (
    UPDATE public.chats AS c
    SET deleted = true
    FROM public.chat_authors AS a
    WHERE a.author_key_hash = public.author_key_hash(p_author_key)
      AND c.uuid = a.chat_uuid
      AND c.room_id = p_room_id
      AND c.name = p_name
      AND c.deleted = false
    RETURNING c.uuid
  )
  SELECT coalesce(array_agg(cleared.uuid ORDER BY cleared.uuid DESC), '{}') FROM cleared
$$;

REVOKE ALL ON FUNCTION public.clear_my_chats(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.clear_my_chats(text, text, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.clear_my_chats(text, text, text) IS
    'その端末（author key）が書いた、部屋と名前が一致する未削除の発言を消し、消した uuid を返す。';
