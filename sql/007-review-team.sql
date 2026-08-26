-- ============================================================
-- 007-review-team.sql  —  reviewer roster + article assignment
--
-- Assignment is advisory. It drives who is shown against an article and the
-- "assigned to me" filter; it never gates who may open or comment on a page.
--
-- Idempotent — safe to re-run.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ---------- the roster the director manages ----------
create table if not exists review_team (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz default now()
);

-- one row per person per article; a page may carry many, a person may carry many
create table if not exists page_assignments (
  id uuid primary key default uuid_generate_v4(),
  page_id uuid references pages(id) on delete cascade,
  slug text not null,
  team_member_id uuid not null references review_team(id) on delete cascade,
  assigned_at timestamptz default now(),
  assigned_by text,
  constraint page_assignments_unique unique (slug, team_member_id)
);

create index if not exists idx_page_assignments_slug on page_assignments(slug);
create index if not exists idx_page_assignments_member on page_assignments(team_member_id);

alter table review_team enable row level security;
alter table page_assignments enable row level security;

grant all privileges on table review_team to service_role;
grant all privileges on table page_assignments to service_role;

-- ============================================================
-- RLS — read-only for anon, exactly as with page_comments.
--
-- Reviewers need to read the roster to pick their name and to see who an
-- article is assigned to, so anon gets SELECT on both tables and nothing else.
-- Adding or removing a team member, and assigning or unassigning an article,
-- all run through functions/api/director.js with the service-role key behind
-- DIRECTOR_PASSPHRASE. No anon INSERT, UPDATE or DELETE is created here.
-- ============================================================

grant select on table review_team to anon;
grant select on table page_assignments to anon;

drop policy if exists "anon read team" on review_team;
create policy "anon read team" on review_team
  for select to anon using (true);

drop policy if exists "anon read assignments" on page_assignments;
create policy "anon read assignments" on page_assignments
  for select to anon using (true);

-- Deliberately NOT created: any INSERT/UPDATE/DELETE policy for anon on
-- either table.

-- ---------- verification ----------
-- select count(*) from review_team;
-- select count(*) from page_assignments;
