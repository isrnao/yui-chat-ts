-- Migration: Add metadata JSONB column to chats table
-- Purpose: Support font style, avatar, and message kind metadata
-- Requirements: 3.3 (フォントスタイルメタデータ), 5.4 (アバターメタデータ)
--
-- Run this migration against your Supabase project:
--   psql $DATABASE_URL -f 001_add_metadata_column.sql
-- Or via Supabase Dashboard > SQL Editor

-- Add metadata JSONB column (nullable, defaults to NULL for backward compatibility)
ALTER TABLE chats ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- Note on RLS (Row Level Security):
-- If your RLS policies explicitly list allowed columns for INSERT/SELECT,
-- you must update them to include the `metadata` column.
--
-- Example: If your INSERT policy uses a column check like:
--   WITH CHECK (true)
-- then no change is needed (all columns are implicitly allowed).
--
-- If your SELECT policy uses:
--   USING (true)
-- then no change is needed (all columns are implicitly readable).
--
-- However, if you have column-level security or a restrictive policy,
-- ensure `metadata` is included in the allowed columns list.
--
-- Example update for a restrictive INSERT policy:
--   ALTER POLICY "allow_insert" ON chats
--     USING (true)
--     WITH CHECK (true);
--
-- Verify after migration:
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'chats' AND column_name = 'metadata';

-- Add deleted flag for soft delete (logical deletion)
-- Purpose: clear コマンドで自分の発言を論理削除する（証拠として DB に残す）
ALTER TABLE chats ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;

-- deleted カラムにインデックスを追加（読み込み時のフィルタ高速化）
CREATE INDEX IF NOT EXISTS idx_chats_deleted ON chats (deleted) WHERE deleted = FALSE;

-- RLS: UPDATE ポリシーを追加（clear コマンドによる論理削除に必要）
-- `deleted` カラムのみ更新可能にし、未削除→削除済みの遷移だけを許可する
-- 再実行可能にするため DROP IF EXISTS を挟む
REVOKE UPDATE ON chats FROM PUBLIC;
GRANT UPDATE (deleted) ON chats TO PUBLIC;
DROP POLICY IF EXISTS "public-update" ON chats;
CREATE POLICY "public-update" ON chats
  FOR UPDATE
  USING (deleted = FALSE)
  WITH CHECK (deleted = TRUE);
