\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.chats (uuid, room_id, name, color, message, time, deleted) VALUES
 ('01993200-0000-7000-8000-000000000001', 'superbeginner', 'alice', '#000000', '京都旅行の計画', (extract(epoch from now())*1000)::bigint, false),
 ('01993200-0000-7000-8000-000000000002', 'superbeginner', 'bob', '#000000', '京都旅行の秘密', (extract(epoch from now())*1000)::bigint, true),
 ('01993200-0000-7000-8000-000000000003', 'hajime', 'alice', '#000000', '京都旅行は別室', (extract(epoch from now())*1000)::bigint, false),
 ('01993200-0000-7000-8000-000000000004', 'superbeginner', 'bob', '#000000', '京都旅行の続き', (extract(epoch from now())*1000)::bigint, false);
SET LOCAL ROLE chat_search_reader;
SET LOCAL enable_seqscan = off;
SET LOCAL pgroonga.enable_row_level_security = on;
DO $$ BEGIN
  ASSERT (SELECT count(uuid) = 2 FROM public.chats WHERE room_id='superbeginner'
    AND deleted=false AND message OPERATOR(extensions.&@) '京都'
    AND message OPERATOR(extensions.&@) '旅行'), 'Japanese AND search / RLS failed';
  ASSERT (SELECT count(uuid)=0 FROM public.chats WHERE deleted=true), 'deleted text leaked';
  BEGIN
    PERFORM ip FROM public.chats;
    RAISE EXCEPTION 'raw IP grant leaked';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.chats SET deleted=true;
    RAISE EXCEPTION 'search role can write';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.clear_chat_logs('superbeginner',NULL);
    RAISE EXCEPTION 'search role can invoke deletion';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  ASSERT (SELECT count(uuid)=0 FROM public.chats WHERE deleted=true), 'anon bypassed deleted filter';
  PERFORM public.clear_chat_logs('superbeginner','alice');
  ASSERT (SELECT count(uuid)=0 FROM public.chats WHERE room_id='superbeginner' AND name='alice'), 'cut failed';
  ASSERT (SELECT count(uuid)=1 FROM public.chats WHERE room_id='hajime' AND name='alice'), 'cut crossed rooms';
  ASSERT (SELECT count(uuid)=1 FROM public.chats WHERE room_id='superbeginner' AND name='bob'), 'cut deleted another name';
  PERFORM public.clear_chat_logs('superbeginner',NULL);
  ASSERT (SELECT count(uuid)=0 FROM public.chats WHERE room_id='superbeginner'), 'clear failed';
  BEGIN
    UPDATE public.chats SET message='changed';
    RAISE EXCEPTION 'anon can change body';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE chat_search_reader;
DO $$ BEGIN
  ASSERT (SELECT count(uuid)=0 FROM public.chats WHERE room_id='superbeginner' AND message OPERATOR(extensions.&@) '京都'), 'deleted search result survived';
END $$;
ROLLBACK;
