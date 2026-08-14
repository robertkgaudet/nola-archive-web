-- ============================================================
-- Read-only anon access for the Stage 3a Experiences view.
--
-- Same two-gate rule as anon-read-policies.sql, and they fail differently:
--   GRANT missing  -> 42501 "permission denied" (loud)
--   POLICY missing -> query succeeds, returns ZERO rows (silent)
--
-- Idempotent — safe to re-run.
-- ============================================================

grant select on table experiences       to anon;
grant select on table experience_facets to anon;

drop policy if exists "anon read experiences" on experiences;
create policy "anon read experiences" on experiences
  for select to anon using (true);

drop policy if exists "anon read experience_facets" on experience_facets;
create policy "anon read experience_facets" on experience_facets
  for select to anon using (true);

-- ---------- verification (both should return rows) ----------
-- select count(*) from experiences;
-- select count(*) from experience_facets;
