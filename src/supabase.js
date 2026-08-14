import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Surfaced in the UI rather than thrown, so a missing key shows an explanation
// instead of a blank screen.
export const configError = !url
  ? 'VITE_SUPABASE_URL is not set'
  : !key
    ? 'VITE_SUPABASE_ANON_KEY is not set'
    : null;

export const supabase = configError ? null : createClient(url, key);

// PostgREST caps a single response at 1000 rows; page until short.
// `refine` receives the query builder so callers can add filters (e.g. to
// exclude merged tombstones) while keeping the paging in one place.
export async function fetchAll(table, select, refine) {
  const out = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    let query = supabase.from(table).select(select);
    if (refine) query = refine(query);
    const { data, error } = await query.range(from, from + size - 1);
    if (error) {
      const detail = [error.code, error.message, error.hint].filter(Boolean).join(' — ');
      throw new Error(`${table}: ${detail || 'request failed'}`);
    }
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}
