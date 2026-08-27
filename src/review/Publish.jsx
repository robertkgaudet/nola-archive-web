import { useMemo, useState } from 'react';
import { computeSchedule, normalizeOptions, byDate } from '../../shared/schedule.js';

/**
 * The publish scheduler — director only.
 *
 * This component renders inside the queue, which is already behind the
 * director passphrase, so a reviewer never reaches it. That is presentation,
 * not security: every action below is re-checked server-side in
 * functions/api/director.js, which is what actually keeps publishing shut.
 *
 * Publishing is deliberately three separate decisions:
 *
 *   approve   a page becomes eligible. Nothing is dated.
 *   schedule  dates are assigned. Still nothing on WordPress.
 *   push      the posts are created, future-dated, and WordPress releases
 *             each one itself when its day arrives.
 *
 * Draft is the default and draft never leaves. The preview writes nothing at
 * all — it is the same calculation the server repeats when committing, so what
 * the director approves is what gets stored.
 */

const STATES = ['draft', 'approved', 'scheduled', 'published'];

const LABEL = {
  draft: 'Draft',
  approved: 'Approved',
  scheduled: 'Scheduled',
  published: 'Published'
};

const fmtDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, {
  weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
});

export default function Publish({ pages, comments, migrated, call, busy, onChanged }) {
  const [picked, setPicked] = useState(() => new Set());
  const [opts, setOpts] = useState({
    startDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    everyDays: 7,
    perRelease: 1,
    hour: 9,
    skipWeekends: false
  });
  const [orderMode, setOrderMode] = useState('review');
  const [manual, setManual] = useState(null);      // slug[] once the director reorders
  const [result, setResult] = useState(null);      // last push / check result
  const [note, setNote] = useState('');

  /**
   * "Review ranking" has no column behind it, so it is defined here: the pages
   * carrying the least unresolved feedback go first, because those are the ones
   * ready to be read. Ties fall back to title so the order is stable.
   */
  const openByPage = useMemo(() => {
    const m = {};
    for (const c of comments || []) if (c.status === 'open') m[c.slug] = (m[c.slug] || 0) + 1;
    return m;
  }, [comments]);

  const counts = useMemo(() => {
    const m = Object.fromEntries(STATES.map((s) => [s, 0]));
    for (const p of pages || []) m[p.publish_status || 'draft'] = (m[p.publish_status || 'draft'] || 0) + 1;
    return m;
  }, [pages]);

  const inState = (s) => (pages || []).filter((p) => (p.publish_status || 'draft') === s);

  const ranked = useMemo(() => {
    const list = [...inState('approved'), ...inState('scheduled')];
    const sorted = list.sort((a, b) => {
      if (orderMode === 'title') return a.title.localeCompare(b.title);
      const d = (openByPage[a.slug] || 0) - (openByPage[b.slug] || 0);
      return d !== 0 ? d : a.title.localeCompare(b.title);
    });
    if (!manual) return sorted;
    // Keep the director's order, but drop anything no longer schedulable and
    // append anything newly approved rather than losing it.
    const bySlug = Object.fromEntries(sorted.map((p) => [p.slug, p]));
    const kept = manual.map((s) => bySlug[s]).filter(Boolean);
    const extra = sorted.filter((p) => !manual.includes(p.slug));
    return [...kept, ...extra];
  }, [pages, orderMode, manual, openByPage]);

  const norm = normalizeOptions(opts);
  const schedule = norm.ok ? computeSchedule(ranked.map((p) => p.slug), norm.opts) : [];
  const titleOf = Object.fromEntries((pages || []).map((p) => [p.slug, p.title]));

  function move(slug, dir) {
    const cur = ranked.map((p) => p.slug);
    const i = cur.indexOf(slug);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cur.length) return;
    [cur[i], cur[j]] = [cur[j], cur[i]];
    setManual(cur);
  }

  const toggle = (slug) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(slug)) next.delete(slug); else next.add(slug);
    return next;
  });

  async function run(fn, okMsg) {
    setNote(''); setResult(null);
    try {
      const r = await fn();
      if (okMsg) setNote(typeof okMsg === 'function' ? okMsg(r) : okMsg);
      await onChanged();
      return r;
    } catch (e) {
      setNote(`Failed: ${e.message}`);
      return null;
    }
  }

  if (!migrated) {
    return (
      <div className="rv-pub">
        <div className="rv-field-label" style={{ marginTop: 22 }}>Publish</div>
        <p className="rv-hint">
          The publishing columns are not on the database yet. Run
          <code> sql/009-publish-scheduler.sql</code>, then reload this page.
          Nothing can be approved, scheduled or pushed until then — which is the
          safe way round.
        </p>
      </div>
    );
  }

  const drafts = inState('draft');
  const approved = inState('approved');
  const scheduled = inState('scheduled');
  const published = inState('published');

  return (
    <div className="rv-pub">

      {/* ---------------- where everything stands ---------------- */}
      <div className="rv-field-label" style={{ marginTop: 22 }}>Publishing status</div>
      <div className="rv-pub-counts">
        {STATES.map((s) => (
          <div key={s} className={`rv-pub-count ${s}`}>
            <b>{counts[s] || 0}</b>
            <span>{LABEL[s]}</span>
          </div>
        ))}
      </div>
      <p className="rv-hint">
        A page reaches noladmc.com only by being approved, then scheduled, then
        pushed — three separate decisions. Drafts never publish.
      </p>
      {note && <p className="rv-hint" style={{ color: 'var(--ink)' }}><b>{note}</b></p>}

      {/* ---------------- step 1: approve ---------------- */}
      <div className="rv-field-label" style={{ marginTop: 30 }}>1 · Approve</div>
      <p className="rv-hint">Only approved pages can be scheduled. {drafts.length} in draft.</p>

      {drafts.length > 0 && (
        <>
          <div className="rv-q-actions" style={{ marginBottom: 10 }}>
            <button className="rv-btn ghost small" onClick={() => setPicked(new Set(drafts.map((p) => p.slug)))}>
              Select all {drafts.length}
            </button>
            <button className="rv-btn ghost small" onClick={() => setPicked(new Set())}>Clear</button>
            <span className="rv-spacer" />
            <button className="rv-btn small" disabled={busy || !picked.size}
              onClick={() => run(
                () => call({ action: 'approve', slugs: [...picked] }),
                (r) => `Approved ${r.changed} page${r.changed === 1 ? '' : 's'}.`
              ).then(() => setPicked(new Set()))}>
              Approve {picked.size || ''} selected
            </button>
          </div>
          <div className="rv-pub-list">
            {drafts.map((p) => (
              <label key={p.slug} className="rv-pub-row">
                <input type="checkbox" checked={picked.has(p.slug)} onChange={() => toggle(p.slug)} />
                <span className="t">{p.title}</span>
                <span className="rv-pub-open">{openByPage[p.slug] ? `${openByPage[p.slug]} open` : 'clear'}</span>
              </label>
            ))}
          </div>
        </>
      )}

      {approved.length > 0 && (
        <div className="rv-q-actions" style={{ marginTop: 10 }}>
          <span className="rv-q-meta">{approved.length} approved and waiting</span>
          <span className="rv-spacer" />
          <button className="rv-btn ghost small" disabled={busy}
            onClick={() => run(
              () => call({ action: 'unapprove', slugs: approved.map((p) => p.slug) }),
              (r) => `Sent ${r.changed} back to draft.`
            )}>
            Send all back to draft
          </button>
        </div>
      )}

      {/* ---------------- step 2: schedule ---------------- */}
      <div className="rv-field-label" style={{ marginTop: 30 }}>2 · Cadence</div>
      {!ranked.length && <p className="rv-hint">Nothing approved yet, so there is nothing to schedule.</p>}

      {ranked.length > 0 && (
        <>
          <div className="rv-pub-opts">
            <label>Start
              <input type="date" value={opts.startDate}
                onChange={(e) => setOpts({ ...opts, startDate: e.target.value })} />
            </label>
            <label>Release every
              <input type="number" min="1" max="30" value={opts.everyDays}
                onChange={(e) => setOpts({ ...opts, everyDays: e.target.value })} />
              <span className="u">days</span>
            </label>
            <label>Posts per release
              <select value={opts.perRelease} onChange={(e) => setOpts({ ...opts, perRelease: Number(e.target.value) })}>
                <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
              </select>
            </label>
            <label>At
              <input type="number" min="0" max="23" value={opts.hour}
                onChange={(e) => setOpts({ ...opts, hour: e.target.value })} />
              <span className="u">:00</span>
            </label>
            <label className="chk">
              <input type="checkbox" checked={opts.skipWeekends}
                onChange={(e) => setOpts({ ...opts, skipWeekends: e.target.checked })} />
              Skip weekends
            </label>
            <label>Order
              <select value={orderMode} onChange={(e) => { setOrderMode(e.target.value); setManual(null); }}>
                <option value="review">Review ranking</option>
                <option value="title">Title A–Z</option>
              </select>
            </label>
          </div>
          <p className="rv-hint">
            Review ranking puts the pages with the least unresolved feedback first.
            Use the arrows in the calendar to move any page.
            {manual && <> <button className="rv-linkbtn" onClick={() => setManual(null)}>Reset order</button></>}
          </p>
          {!norm.ok && <p className="rv-err">{norm.error}</p>}

          {/* ---------------- calendar preview ---------------- */}
          {norm.ok && (
            <>
              <div className="rv-field-label" style={{ marginTop: 26 }}>
                Calendar preview — {schedule.length} posts, {byDate(schedule).length} release days
              </div>
              <p className="rv-hint">
                Nothing has been written. This is the plan; committing stores the dates,
                and only the push in step 3 touches WordPress.
              </p>
              <div className="rv-cal">
                {byDate(schedule).map((row) => (
                  <div key={row.day} className="rv-cal-row">
                    <div className="d">{fmtDay(row.day)}</div>
                    <div className="p">
                      {row.items.map((it) => (
                        <div key={it.slug} className="rv-cal-item">
                          <span className="hh">{it.date.slice(11, 16)}</span>
                          <span className="tt">{titleOf[it.slug] || it.slug}</span>
                          <span className="mv">
                            <button title="Earlier" onClick={() => move(it.slug, -1)}>↑</button>
                            <button title="Later" onClick={() => move(it.slug, 1)}>↓</button>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rv-q-actions" style={{ marginTop: 14 }}>
                <button className="rv-btn small" disabled={busy}
                  onClick={() => run(
                    () => call({
                      action: 'schedule_commit',
                      options: opts,
                      slugs: ranked.map((p) => p.slug)
                    }),
                    (r) => `Scheduled ${r.count} pages. Nothing has been sent to WordPress yet.`
                  )}>
                  {busy ? 'Working…' : `Commit this schedule (${schedule.length})`}
                </button>
                {scheduled.length > 0 && (
                  <button className="rv-btn ghost small" disabled={busy}
                    onClick={() => run(
                      () => call({ action: 'schedule_clear' }),
                      (r) => `Unscheduled ${r.cleared}; they are approved again.`
                    )}>
                    Unschedule all {scheduled.length}
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ---------------- step 3: push ---------------- */}
      <div className="rv-field-label" style={{ marginTop: 32 }}>3 · Push to WordPress</div>
      <p className="rv-hint">
        Creates each scheduled page as a future-dated post. WordPress releases them
        on their own dates — nothing has to run on the day. Pages already carrying a
        WordPress id are skipped, so pushing twice cannot double-post.
      </p>

      <div className="rv-q-actions">
        <button className="rv-btn ghost small" disabled={busy}
          onClick={() => run(async () => {
            const r = await call({ action: 'publish_check' });
            setResult({ check: r.user });
            return r;
          }, (r) => `WordPress reachable as ${r.user.name}.`)}>
          Test connection
        </button>
        <span className="rv-spacer" />
        <button className="rv-btn small" disabled={busy || !scheduled.length}
          onClick={() => {
            if (!confirm(`Create ${scheduled.length} future-dated posts on noladmc.com?\n\nThey stay unpublished until their scheduled dates.`)) return;
            run(async () => {
              const r = await call({ action: 'publish_push' });
              setResult(r);
              return r;
            }, (r) => `Pushed ${r.pushed.length}, failed ${r.failed.length}, skipped ${r.skipped.length}.`);
          }}>
          {busy ? 'Pushing…' : `Push ${scheduled.length} scheduled post${scheduled.length === 1 ? '' : 's'}`}
        </button>
      </div>

      {result?.pushed && (
        <div className="rv-pub-result">
          {result.pushed.length > 0 && (
            <>
              <div className="rv-field-label" style={{ marginTop: 18 }}>Pushed</div>
              {result.pushed.map((r) => (
                <div key={r.slug} className="rv-pub-res ok">
                  <b>{titleOf[r.slug] || r.slug}</b>
                  <span>post {r.wp_post_id} · {String(r.date).slice(0, 16).replace('T', ' ')}</span>
                  {r.url && <a href={r.url} target="_blank" rel="noreferrer">view</a>}
                </div>
              ))}
            </>
          )}
          {result.failed.length > 0 && (
            <>
              <div className="rv-field-label" style={{ marginTop: 18 }}>Failed</div>
              {result.failed.map((r) => (
                <div key={r.slug} className="rv-pub-res bad">
                  <b>{titleOf[r.slug] || r.slug}</b>
                  <span>{r.error}</span>
                </div>
              ))}
            </>
          )}
          {result.skipped.length > 0 && (
            <p className="rv-hint" style={{ marginTop: 12 }}>
              {result.skipped.length} already had a WordPress post and were left alone.
            </p>
          )}
        </div>
      )}

      {published.length > 0 && (
        <>
          <div className="rv-field-label" style={{ marginTop: 26 }}>Live on WordPress ({published.length})</div>
          <div className="rv-pub-list">
            {published.map((p) => (
              <div key={p.slug} className="rv-pub-row">
                <span className="t">{p.title}</span>
                <span className="rv-pub-open">
                  {p.scheduled_date ? String(p.scheduled_date).slice(0, 10) : ''} · post {p.wp_post_id}
                </span>
                {p.published_url && <a className="rv-link" href={p.published_url} target="_blank" rel="noreferrer">view</a>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
