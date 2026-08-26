-- ============================================================
-- 008-review-attribution.sql  —  who changed what
--
-- page_versions already carries a free-text note naming the actor, but a note
-- is for reading, not querying. These columns make attribution a field.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- who made the change this snapshot was taken before, or who reverted
alter table page_versions
  add column if not exists edited_by text;

-- who last changed a comment body or its delete flag (any reviewer may)
alter table page_comments
  add column if not exists edited_by text,
  add column if not exists edited_at timestamptz;

-- ---------- verification ----------
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='page_versions' and column_name='edited_by';
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='page_comments'
--    and column_name in ('edited_by','edited_at');
