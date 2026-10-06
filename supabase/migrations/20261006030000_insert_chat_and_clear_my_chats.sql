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
-- 締める（anon の public-update と UPDATE (deleted) を外す）のは、Web を切り替えて 1 日たってから別のマイグレーションで行う
-- （開いたままの古いタブが PATCH で消し続けるため）。
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

-- 発言を保存する（save-chat が service_role で呼ぶ）。
--
-- p_chats: 保存する行の配列（順に入れる。uuidv7_sub_ms() は行ごとに clock_timestamp() を読むので、配列の順に並ぶ）
--   { room_id, name, color, message, system, email, metadata, ip, ua, author }
--   author = true の行だけ chat_authors に鍵のハッシュを書く（巫女の返事などサーバーが作る行は false）
-- p_author_key: x-chat-author-key の値。NULL や形の合わない値なら chat_authors に書かない
--
-- 返す値: 入れた行の uuid / room_id / time / ip_masked / ua と、部屋の triage（save-chat の振り分けに使う）。
-- 部屋の確かめは chats の外部キーとトリガー chats_room_enabled が行う（23503 / YC001）。
CREATE OR REPLACE FUNCTION public.insert_chat(p_chats jsonb, p_author_key text DEFAULT NULL)
RETURNS TABLE (uuid uuid, room_id text, "time" bigint, ip_masked text, ua text, triage boolean)
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_hash bytea := public.author_key_hash(p_author_key);
  v_row jsonb;
  v_saved public.chats;
BEGIN
  IF jsonb_typeof(p_chats) IS DISTINCT FROM 'array' OR jsonb_array_length(p_chats) = 0 THEN
    RAISE EXCEPTION 'p_chats must be a non-empty array' USING ERRCODE = '22023';
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

    uuid := v_saved.uuid;
    room_id := v_saved.room_id;
    "time" := v_saved."time";
    ip_masked := v_saved.ip_masked;
    ua := v_saved.ua;
    triage := coalesce((SELECT r.triage FROM public.rooms AS r WHERE r.id = v_saved.room_id), false);
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_chat(jsonb, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_chat(jsonb, text) TO service_role;

COMMENT ON FUNCTION public.insert_chat(jsonb, text) IS
    '発言を保存する（save-chat 専用、service_role）。p_chats の順に chats へ入れ、author = true の行は鍵のハッシュを chat_authors に書く。';

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
