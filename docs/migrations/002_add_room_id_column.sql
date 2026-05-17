-- Migration: add room_id column for multi-room chat routing
-- Purpose: allow /chat/:roomId URLs to read and write isolated room timelines

ALTER TABLE chats ADD COLUMN IF NOT EXISTS room_id TEXT NOT NULL DEFAULT 'superbeginner';

CREATE INDEX IF NOT EXISTS idx_chats_room_uuid ON chats (room_id, uuid DESC);
CREATE INDEX IF NOT EXISTS idx_chats_room_deleted_uuid
  ON chats (room_id, uuid DESC)
  WHERE deleted = FALSE;

-- Optional policy hardening example:
-- DROP POLICY IF EXISTS "public-insert" ON chats;
-- CREATE POLICY "public-insert" ON chats
--   FOR INSERT
--   WITH CHECK (room_id IN ('superbeginner', 'hajime', 'ofall'));
