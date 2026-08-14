-- ============================================================
-- Read-only anon access for the Stage 3b Pages view.
--
-- Two gates, and they fail differently:
--   GRANT missing  -> 42501 "permission denied" (loud)
--   POLICY missing -> query succeeds, returns ZERO rows (silent)
--
-- Idempotent — safe to re-run.
-- ============================================================

grant select on table pages to anon;

drop policy if exists "anon read pages" on pages;
create policy "anon read pages" on pages
  for select to anon using (true);

-- ---------- verification ----------
-- select count(*) from pages;
