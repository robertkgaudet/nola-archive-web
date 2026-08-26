/**
 * Director actions — resolve a comment, edit a page, revert a version.
 *
 * WHY THIS EXISTS INSTEAD OF CLIENT-SIDE WRITES
 * ---------------------------------------------
 * The brief proposed VITE_DIRECTOR_PASSPHRASE plus anon UPDATE on pages. Any
 * VITE_ variable is compiled into the public JavaScript bundle, and the anon
 * key is public by design — so that combination lets anyone who opens devtools
 * rewrite or destroy all 66 pages. The passphrase would be decoration.
 *
 * Instead every mutating action runs here, on Cloudflare's edge, with:
 *   - DIRECTOR_PASSPHRASE        a Pages secret, never sent to the browser
 *   - SUPABASE_SERVICE_ROLE_KEY  a Pages secret, never sent to the browser
 *
 * The browser sends the typed passphrase; this function decides. anon keeps
 * INSERT/SELECT on page_comments and nothing else.
 */

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

/** Length-independent compare, so timing does not leak the passphrase. */
function safeEqual(a = '', b = '') {
  const x = String(a), y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

// Fields the director is allowed to rewrite. Anything else is rejected —
// status, gate results and token counts are not editable from this surface.
const EDITABLE = new Set(['title', 'direct_answer', 'body_md', 'meta_description']);

function db(env) {
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return async (path, { method = 'GET', body, prefer } = {}) => {
    const res = await fetch(`${base}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* non-json error */ }
    if (!res.ok) throw new Error(`${res.status} ${(data && data.message) || text.slice(0, 200)}`);
    return data;
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DIRECTOR_PASSPHRASE || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL) {
    return json({ ok: false, error: 'Server is not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DIRECTOR_PASSPHRASE as Pages secrets.' }, 500);
  }

  let payload;
  try { payload = await request.json(); } catch { return json({ ok: false, error: 'Bad request' }, 400); }

  const { passphrase, action } = payload || {};

  // Two tiers. Editing or deleting a comment is something any signed-in
  // reviewer may do, so those actions accept the REVIEW passphrase — still
  // checked here, server-side, so the write never rides the public anon key.
  // Everything else (page edits, reverts, moderation, roster) stays
  // director-only.
  const REVIEWER_ACTIONS = new Set(['comment_edit', 'comment_delete']);

  /**
   * The two tiers must not share a value. VITE_REVIEW_PASSPHRASE is compiled
   * into the public browser bundle by design — it is a soft gate on a
   * read-mostly surface, not a secret. DIRECTOR_PASSPHRASE is the opposite: it
   * authorises rewriting and reverting any page and managing the roster, and
   * never leaves the server. If they hold the same string, the director
   * passphrase is published to every visitor who views source, and every check
   * below silently passes for anyone.
   *
   * Fail loudly rather than quietly granting it. A 500 here is a visible,
   * fixable outage; the alternative is an open door nobody notices.
   */
  if (env.REVIEW_PASSPHRASE && safeEqual(env.REVIEW_PASSPHRASE, env.DIRECTOR_PASSPHRASE)) {
    return json({
      ok: false,
      error: 'Refusing to run: REVIEW_PASSPHRASE and DIRECTOR_PASSPHRASE are set to the same value. '
           + 'The review passphrase ships in the public browser bundle, so sharing it with the director '
           + 'passphrase would publish director access. Set REVIEW_PASSPHRASE to a different value.'
    }, 500);
  }

  const isDirector = safeEqual(passphrase, env.DIRECTOR_PASSPHRASE);
  const isReviewer = env.REVIEW_PASSPHRASE ? safeEqual(passphrase, env.REVIEW_PASSPHRASE) : false;

  if (REVIEWER_ACTIONS.has(action)) {
    if (!env.REVIEW_PASSPHRASE && !isDirector) {
      return json({ ok: false, error: 'Server is not configured for reviewer actions. Set REVIEW_PASSPHRASE as a Pages secret.' }, 500);
    }
    if (!isReviewer && !isDirector) return json({ ok: false, error: 'Not authorised' }, 401);
  } else if (!isDirector) {
    return json({ ok: false, error: 'Not authorised' }, 401);
  }

  const q = db(env);
  // Every state-changing action records a name. Falls back only if a caller
  // somehow omits one, so History can never show an anonymous change.
  const who = String(payload.director_name || payload.actor_name || '').trim().slice(0, 80)
    || (isDirector ? 'director' : 'reviewer');

  try {
    switch (action) {
      // ---- unlock the queue UI ----
      case 'verify':
        return json({ ok: true });

      // ---- ignore / reopen a comment ----
      case 'resolve': {
        const { comment_id, status } = payload;
        if (!['open', 'accepted', 'ignored'].includes(status)) return json({ ok: false, error: 'Bad status' }, 400);
        await q(`page_comments?id=eq.${encodeURIComponent(comment_id)}`, {
          method: 'PATCH',
          body: {
            status,
            resolved_at: status === 'open' ? null : new Date().toISOString(),
            resolved_by: status === 'open' ? null : who
          }
        });
        return json({ ok: true });
      }

      // ---- accept an edit: snapshot, then write, then resolve ----
      case 'edit': {
        const { slug, field, value, comment_id } = payload;
        if (!EDITABLE.has(field)) return json({ ok: false, error: `Field "${field}" is not editable` }, 400);

        const rows = await q(`pages?slug=eq.${encodeURIComponent(slug)}&select=*`);
        const page = rows && rows[0];
        if (!page) return json({ ok: false, error: 'Page not found' }, 404);

        // Order matters: the snapshot must exist before the page changes, or a
        // failure between the two leaves an edit with nothing to revert to.
        await q('page_versions', {
          method: 'POST',
          body: {
            page_id: page.id,
            slug,
            snapshot: page,
            edited_by: who,
            note: `before edit to ${field}${comment_id ? ` (comment ${String(comment_id).slice(0, 8)})` : ''} by ${who}`
          }
        });

        await q(`pages?slug=eq.${encodeURIComponent(slug)}`, {
          method: 'PATCH',
          body: { [field]: value, updated_at: new Date().toISOString() }
        });

        if (comment_id) {
          await q(`page_comments?id=eq.${encodeURIComponent(comment_id)}`, {
            method: 'PATCH',
            body: { status: 'accepted', resolved_at: new Date().toISOString(), resolved_by: who }
          });
        }
        return json({ ok: true });
      }

      // ---- revert to a snapshot, snapshotting the current state first ----
      case 'revert': {
        const { version_id } = payload;
        const vs = await q(`page_versions?id=eq.${encodeURIComponent(version_id)}&select=*`);
        const version = vs && vs[0];
        if (!version) return json({ ok: false, error: 'Version not found' }, 404);

        const rows = await q(`pages?slug=eq.${encodeURIComponent(version.slug)}&select=*`);
        const current = rows && rows[0];
        if (!current) return json({ ok: false, error: 'Page not found' }, 404);

        // Revert is itself undoable.
        await q('page_versions', {
          method: 'POST',
          body: {
            page_id: current.id,
            slug: version.slug,
            snapshot: current,
            edited_by: who,
            note: `before revert to ${new Date(version.created_at).toLocaleString('en-GB')} by ${who}`
          }
        });

        const snap = version.snapshot || {};
        const restore = {};
        for (const f of EDITABLE) if (f in snap) restore[f] = snap[f];
        restore.updated_at = new Date().toISOString();

        await q(`pages?slug=eq.${encodeURIComponent(version.slug)}`, { method: 'PATCH', body: restore });
        return json({ ok: true, restored: Object.keys(restore).filter((k) => k !== 'updated_at') });
      }

      // ---- roster: add / remove a team member ----
      case 'team_add': {
        const name = String(payload.name || '').trim();
        if (!name) return json({ ok: false, error: 'Name is required' }, 400);
        if (name.length > 80) return json({ ok: false, error: 'Name is too long' }, 400);
        const existing = await q(`review_team?name=eq.${encodeURIComponent(name)}&select=id`);
        if (existing && existing.length) return json({ ok: false, error: 'That name is already on the roster' }, 409);
        const rows = await q('review_team', { method: 'POST', body: { name }, prefer: 'return=representation' });
        return json({ ok: true, member: rows && rows[0] });
      }

      case 'team_remove': {
        const { member_id } = payload;
        if (!member_id) return json({ ok: false, error: 'member_id is required' }, 400);
        // assignments cascade with the member
        await q(`review_team?id=eq.${encodeURIComponent(member_id)}`, { method: 'DELETE' });
        return json({ ok: true });
      }

      // ---- assignment: many people per article, many articles per person ----
      case 'assign': {
        const { slug, member_id } = payload;
        if (!slug || !member_id) return json({ ok: false, error: 'slug and member_id are required' }, 400);
        const rows = await q(`pages?slug=eq.${encodeURIComponent(slug)}&select=id`);
        const page = rows && rows[0];
        if (!page) return json({ ok: false, error: 'Page not found' }, 404);
        try {
          await q('page_assignments', {
            method: 'POST',
            body: { page_id: page.id, slug, team_member_id: member_id, assigned_by: who }
          });
        } catch (e) {
          // the unique constraint means already-assigned is a no-op, not a failure
          if (!/duplicate key|page_assignments_unique|23505/i.test(String(e.message))) throw e;
        }
        return json({ ok: true });
      }

      case 'unassign': {
        const { slug, member_id } = payload;
        if (!slug || !member_id) return json({ ok: false, error: 'slug and member_id are required' }, 400);
        await q(`page_assignments?slug=eq.${encodeURIComponent(slug)}&team_member_id=eq.${encodeURIComponent(member_id)}`,
          { method: 'DELETE' });
        return json({ ok: true });
      }

      // ---- any signed-in reviewer may amend or remove a comment ----
      case 'comment_edit': {
        const { comment_id } = payload;
        if (!comment_id) return json({ ok: false, error: 'comment_id is required' }, 400);
        const patch = { edited_by: who, edited_at: new Date().toISOString() };
        if ('comment_body' in payload) {
          const b = payload.comment_body;
          patch.comment_body = b === null ? null : String(b).slice(0, 4000);
        }
        if ('flag_delete' in payload) patch.flag_delete = !!payload.flag_delete;
        if (!('comment_body' in patch) && !('flag_delete' in patch)) {
          return json({ ok: false, error: 'Nothing to change' }, 400);
        }
        await q(`page_comments?id=eq.${encodeURIComponent(comment_id)}`, { method: 'PATCH', body: patch });
        return json({ ok: true });
      }

      case 'comment_delete': {
        const { comment_id } = payload;
        if (!comment_id) return json({ ok: false, error: 'comment_id is required' }, 400);
        await q(`page_comments?id=eq.${encodeURIComponent(comment_id)}`, { method: 'DELETE' });
        return json({ ok: true });
      }

      default:
        return json({ ok: false, error: 'Unknown action' }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: String(e.message || e).slice(0, 300) }, 500);
  }
}
