-- ============================================================
-- 006-review-tables.sql  —  annotation + moderation layer
--
-- Two tables behind /review. Nothing here touches the pages table's own
-- columns; page edits are applied by the director flow (see the note on
-- RLS below, which is the important part of this file).
--
-- Idempotent — safe to re-run.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------- reviewer annotations ----------
create table if not exists page_comments (
  id uuid primary key default uuid_generate_v4(),
  page_id uuid references pages(id) on delete cascade,
  slug text not null,                      -- denormalised so a comment survives a page rebuild
  reviewer_name text not null,

  selected_text text not null,             -- the exact words highlighted
  -- A locator that can re-find the highlight after the text around it moves.
  -- { field, paraIndex, start, end, prefix, suffix } — matching is by quote
  -- first and offset only as a fallback; see src/review/anchor.js.
  anchor jsonb not null,

  comment_body text,
  flag_delete boolean not null default false,

  status text not null default 'open' check (status in ('open','accepted','ignored')),
  created_at timestamptz default now(),
  resolved_at timestamptz,
  resolved_by text
);

create index if not exists idx_page_comments_slug on page_comments(slug);
create index if not exists idx_page_comments_status on page_comments(status);

-- ---------- pre-edit snapshots, for revert ----------
create table if not exists page_versions (
  id uuid primary key default uuid_generate_v4(),
  page_id uuid references pages(id) on delete cascade,
  slug text not null,
  snapshot jsonb not null,                 -- the page's fields BEFORE the change
  note text,
  created_at timestamptz default now()
);

create index if not exists idx_page_versions_slug on page_versions(slug);
create index if not exists idx_page_versions_created on page_versions(created_at desc);

alter table page_comments enable row level security;
alter table page_versions enable row level security;

grant all privileges on table page_comments to service_role;
grant all privileges on table page_versions to service_role;

-- ============================================================
-- RLS
--
-- Reviewers are anonymous, so they need INSERT and SELECT on page_comments.
-- That is the whole of what anon gets. Worst case someone who finds the
-- endpoint adds junk comments — annoying, reversible, non-destructive.
--
-- anon gets NO update and NO delete anywhere, and NO write on pages.
-- Everything the director does (resolve a comment, edit a page, revert a
-- version) runs server-side through functions/api/director.js with the
-- service-role key and a passphrase this browser never sees.
--
-- See the note at the bottom for why it is done that way.
-- ============================================================

grant select, insert on table page_comments to anon;
grant select on table page_versions to anon;

drop policy if exists "anon read comments" on page_comments;
create policy "anon read comments" on page_comments
  for select to anon using (true);

drop policy if exists "anon add comments" on page_comments;
create policy "anon add comments" on page_comments
  for insert to anon with check (true);

drop policy if exists "anon read versions" on page_versions;
create policy "anon read versions" on page_versions
  for select to anon using (true);

-- Deliberately NOT created:
--   * any UPDATE or DELETE policy for anon on page_comments
--   * any INSERT policy for anon on page_versions
--   * any UPDATE policy for anon on pages
--
-- ---------- verification ----------
-- select count(*) from page_comments;
-- select count(*) from page_versions;
