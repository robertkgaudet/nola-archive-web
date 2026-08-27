-- ============================================================
-- 009-publish-scheduler.sql  —  approve, schedule, publish
--
-- Publishing is a drip: approved pages get future dates and are pushed to
-- WordPress as `future` posts, which WordPress releases itself on the day.
--
-- The default is 'draft' and draft never publishes. A page reaches WordPress
-- only after a director explicitly approves it, schedules it, and pushes it —
-- three deliberate steps, each behind the director passphrase.
--
--   draft  ->  approved  ->  scheduled  ->  published
--
-- Idempotent — safe to re-run.
-- ============================================================

alter table pages
  add column if not exists publish_status text not null default 'draft',
  add column if not exists scheduled_date timestamptz,
  add column if not exists wp_post_id     int,
  add column if not exists published_url  text;

-- Added separately so re-running does not fail on an existing constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'pages'::regclass
       and conname  = 'pages_publish_status_check'
  ) then
    alter table pages
      add constraint pages_publish_status_check
      check (publish_status in ('draft', 'approved', 'scheduled', 'published'));
  end if;
end $$;

-- The scheduler reads by state constantly; the push reads by wp_post_id to
-- decide what it has already sent.
create index if not exists idx_pages_publish_status on pages(publish_status);
create index if not exists idx_pages_scheduled_date on pages(scheduled_date);

-- ============================================================
-- No new grants and no new policies.
--
-- These columns sit on `pages`, which anon may already SELECT and may not
-- UPDATE. That is exactly right: reviewers can be shown a page's state, and
-- every transition runs through functions/api/director.js with the service-role
-- key behind DIRECTOR_PASSPHRASE. Nothing here opens a client-side write path
-- to publishing.
-- ============================================================

-- ---------- verification ----------
-- select column_name, data_type from information_schema.columns
--  where table_schema='public' and table_name='pages'
--    and column_name in ('publish_status','scheduled_date','wp_post_id','published_url');
--
-- select publish_status, count(*) from pages group by 1 order by 1;
--   expected after this migration: draft | 66
