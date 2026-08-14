-- ============================================================
-- Read-only anon access for Archive Browser v1.
--
-- TWO gates must both be open, and they fail differently:
--   1. GRANT  — missing grants fail with SQLSTATE 42501 "permission denied".
--   2. POLICY — RLS is enabled with no policies, so without one every query
--               succeeds and returns ZERO rows. Silent, not an error.
--
-- research_runs is column-restricted: the header's spend counter needs the
-- token/search columns, but `error` can carry diagnostic text, so it is not
-- granted.
--
-- Idempotent — safe to re-run.
-- ============================================================

grant usage on schema public to anon;

-- content tables: full select
grant select on table providers to anon;
grant select on table facets    to anon;
grant select on table services  to anon;
grant select on table sources   to anon;

-- cost ledger: only the columns the counter needs
grant select (input_tokens, output_tokens, cache_read_tokens, searches_used)
  on table research_runs to anon;

-- ---------- policies ----------
drop policy if exists "anon read providers" on providers;
create policy "anon read providers" on providers
  for select to anon using (true);

drop policy if exists "anon read facets" on facets;
create policy "anon read facets" on facets
  for select to anon using (true);

drop policy if exists "anon read services" on services;
create policy "anon read services" on services
  for select to anon using (true);

drop policy if exists "anon read sources" on sources;
create policy "anon read sources" on sources
  for select to anon using (true);

drop policy if exists "anon read research_runs" on research_runs;
create policy "anon read research_runs" on research_runs
  for select to anon using (true);

-- Deliberately NOT granted: discovery_runs, experiences, experience_facets.
-- Nothing in v1 reads them, so they stay closed.
