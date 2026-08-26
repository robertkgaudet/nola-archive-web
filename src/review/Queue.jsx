import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fetchAll, configError } from '../supabase.js';
import { locate, locateInRaw, flexIndex } from './anchor.js';
import { toBlocks } from './Review.jsx';
import './review.css';

const REVIEW_PASSPHRASE = import.meta.env.VITE_REVIEW_PASSPHRASE || '';

/**
 * Every mutating call goes to the edge function, which holds the director
 * passphrase and the service-role key. The browser never sees either — it
 * sends what was typed and the server decides. See functions/api/director.js.
 */
async function director(payload) {
  const res = await fetch('/api/director', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  let j = null;
  try { j = await res.json(); } catch { /* non-json */ }
  if (!res.ok || !j?.ok) throw new Error(j?.error || `Request failed (${res.status})`);
  return j;
}

const stripCta = (md) => String(md || '').replace(/\{\{CTA_RFP\}\}/g, '').trim();

/**
 * Put the caret on the words the comment is actually about.
 *
 * The quote is shown above the editor but was not marked inside it, so the
 * director had to find it by eye in the raw markdown. Now the editor opens
 * with the span selected and scrolled into view.
 *
 * Matching is the same order used for anchoring: the quote first, the
 * remembered context to choose between repeats, the stored offset only as a
 * tie-break. The textarea holds markdown, not rendered text, so the search is
 * whitespace-tolerant -- see locateInRaw. A quote that can no longer be found
 * is not an error: the caret stays at the top and the note above still says
 * what was quoted.
 */
function scrollOffsetIntoView(ta, index) {
  const cs = window.getComputedStyle(ta);
  const mirror = document.createElement('div');
  for (const prop of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
    'lineHeight', 'textTransform', 'wordSpacing', 'textIndent', 'paddingTop', 'paddingRight',
    'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth',
    'borderLeftWidth', 'boxSizing']) mirror.style[prop] = cs[prop];
  mirror.style.position = 'absolute';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.style.visibility = 'hidden';
  mirror.style.height = 'auto';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';
  mirror.style.width = ta.clientWidth + 'px';
  mirror.textContent = ta.value.slice(0, index);
  const marker = document.createElement('span');
  marker.textContent = '\u200b';  // zero-width, measured not seen
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop;
  document.body.removeChild(mirror);
  ta.scrollTop = Math.max(0, top - ta.clientHeight / 2);
}

function EditTextarea({ value, onChange, comment, field }) {
  const ref = useRef(null);
  const [missed, setMissed] = useState(false);

  // Runs on open and whenever the field selector changes -- deliberately not on
  // every keystroke, which would drag the selection back while the director types.
  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    const anchor = comment.anchor || null;
    const text = ta.value;

    // The paragraph the comment came from gives an offset hint, but only in the
    // field it was made against. On any other field the quote is still worth
    // looking for, just without the hint.
    let hint;
    const home = anchor?.field === 'direct_answer' ? 'direct_answer' : 'body_md';
    if (field === home && Number.isInteger(anchor?.paraIndex)) {
      const paras = field === 'direct_answer'
        ? [text]
        : toBlocks(stripCta(text)).map((b) => b.text);
      const para = paras[anchor.paraIndex];
      if (para) {
        const at = flexIndex(text, para.slice(0, 40));
        if (at !== -1) hint = at + (anchor.start || 0);
      }
    }

    const hit = locateInRaw(anchor, text, comment.selected_text, hint);
    ta.focus({ preventScroll: true });
    if (!hit) {
      setMissed(true);
      ta.setSelectionRange(0, 0);
      ta.scrollTop = 0;
      return;
    }
    setMissed(false);
    ta.setSelectionRange(hit.start, hit.end);
    scrollOffsetIntoView(ta, hit.start);
  }, [comment.id, field]);

  return (
    <>
      <textarea ref={ref} value={value} onChange={onChange} />
      {missed && (
        <p className="rv-hint" style={{ marginTop: 6 }}>
          The quoted text is not in this field any more, so nothing is selected. It may have
          already been edited, or it may live in a different field.
        </p>
      )}
    </>
  );
}

/* ---------------- gates ---------------- */
function ReviewGate({ onEnter }) {
  const [pass, setPass] = useState(''); const [name, setName] = useState(localStorage.getItem('rv_name') || ''); const [err, setErr] = useState('');
  return (
    <div className="rv"><div className="rv-gate">
      <h1>Review</h1>
      <p>The moderation queue sits behind the review passphrase.</p>
      <form onSubmit={(e) => {
        e.preventDefault();
        if (pass !== REVIEW_PASSPHRASE || !REVIEW_PASSPHRASE) return setErr('That passphrase is not right.');
        if (!name.trim()) return setErr('Please add your name.');
        localStorage.setItem('rv_name', name.trim()); localStorage.setItem('rv_ok', '1');
        onEnter(name.trim());
      }}>
        <input type="password" placeholder="Passphrase" value={pass} onChange={(e) => { setPass(e.target.value); setErr(''); }} autoFocus />
        <input type="text" placeholder="Your name" value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} />
        {err && <p className="rv-err">{err}</p>}
        <button className="rv-btn" style={{ width: '100%' }} type="submit">Enter</button>
      </form>
    </div></div>
  );
}

function DirectorGate({ name, onUnlock }) {
  const [pass, setPass] = useState('');
  const [dir, setDir] = useState(() => localStorage.getItem('rv_director_name') || name || '');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <div className="rv"><div className="rv-gate">
      <h1>Editorial director</h1>
      <p>Accepting, editing and reverting is director-only. The passphrase is checked on the server.</p>
      <form onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr('');
        if (!dir.trim()) { setErr('Add your name or initials — every change is attributed.'); setBusy(false); return; }
        try {
          await director({ action: 'verify', passphrase: pass, director_name: dir.trim() });
          localStorage.setItem('rv_director_name', dir.trim());
          onUnlock(pass, dir.trim());
        }
        catch (ex) { setErr(String(ex.message)); }
        setBusy(false);
      }}>
        <input type="password" placeholder="Director passphrase" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus />
        <input type="text" placeholder="Your name or initials" value={dir}
          onChange={(e) => { setDir(e.target.value); setErr(''); }} />
        {err && <p className="rv-err">{err}</p>}
        <button className="rv-btn" style={{ width: '100%' }} disabled={busy} type="submit">{busy ? 'Checking…' : 'Unlock'}</button>
        <p className="rv-hint" style={{ marginTop: 14 }}>
          Reviewers can keep commenting without this. <a href="/review">Back to the pages</a>
        </p>
      </form>
    </div></div>
  );
}

/* ---------------- queue ---------------- */
export default function Queue() {
  const [ok, setOk] = useState(() => localStorage.getItem('rv_ok') === '1' && !!localStorage.getItem('rv_name'));
  const [name, setName] = useState(() => localStorage.getItem('rv_name') || '');
  const [pass, setPass] = useState(null);              // director passphrase, session only
  const [dirName, setDirName] = useState(() => localStorage.getItem('rv_director_name') || '');
  const [pages, setPages] = useState(null);
  const [comments, setComments] = useState([]);
  const [versions, setVersions] = useState([]);
  const [team, setTeam] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [newMember, setNewMember] = useState('');
  const [assignFilter, setAssignFilter] = useState('');
  const [err, setErr] = useState(configError);
  const [filterPage, setFilterPage] = useState('all');
  const [filterStatus, setFilterStatus] = useState('open');
  const [editing, setEditing] = useState(null);        // { comment, field, value }
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('queue');

  const load = useCallback(async () => {
    try {
      const [p, c, v] = await Promise.all([
        fetchAll('pages', 'id, slug, title, direct_answer, body_md, meta_description'),
        fetchAll('page_comments', 'id, slug, reviewer_name, selected_text, anchor, comment_body, flag_delete, status, created_at, resolved_at, resolved_by'),
        fetchAll('page_versions', 'id, slug, note, created_at, edited_by')
      ]);
      setPages(p); setComments(c); setVersions(v);
      // optional until migration 007 has been run
      try {
        const [t, a] = await Promise.all([
          fetchAll('review_team', 'id, name, created_at'),
          fetchAll('page_assignments', 'id, slug, team_member_id, assigned_by, assigned_at')
        ]);
        setTeam(t.sort((x, y) => x.name.localeCompare(y.name))); setAssignments(a);
      } catch { setTeam([]); setAssignments([]); }
    } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => { if (ok && !configError) load(); }, [ok, load]);

  const pageBySlug = useMemo(() => Object.fromEntries((pages || []).map((p) => [p.slug, p])), [pages]);

  // flag comments whose quoted text can no longer be found
  const anchored = useMemo(() => {
    const m = {};
    for (const c of comments) {
      const page = pageBySlug[c.slug];
      if (!page) { m[c.id] = false; continue; }
      const field = c.anchor?.field === 'direct_answer' ? 'direct_answer' : 'body_md';
      const texts = field === 'direct_answer'
        ? [page.direct_answer || '']
        : toBlocks(stripCta(page.body_md)).map((b) => b.text);
      m[c.id] = !!locate(c.anchor, texts);
    }
    return m;
  }, [comments, pageBySlug]);

  if (!ok) return <ReviewGate onEnter={(n) => { setName(n); setOk(true); }} />;
  if (!pass) return <DirectorGate name={name} onUnlock={(p, d) => { setPass(p); setDirName(d); }} />;
  if (err) return <div className="rv"><div className="rv-wrap" style={{ paddingTop: 70 }}>
    Cannot load: {err}<p className="rv-hint">If this mentions a missing table, migration 006 has not been run yet.</p></div></div>;
  if (!pages) return <div className="rv"><div className="rv-wrap" style={{ paddingTop: 70 }}>Loading…</div></div>;

  const rows = comments
    .filter((c) => (filterStatus === 'all' ? true : c.status === filterStatus))
    .filter((c) => (filterPage === 'all' ? true : c.slug === filterPage))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  async function act(fn) {
    setBusy(true);
    try { await fn(); await load(); }
    catch (e) { alert(String(e.message)); }
    setBusy(false);
  }

  const openEditor = (c) => {
    const page = pageBySlug[c.slug];
    if (!page) return;
    const field = c.anchor?.field === 'direct_answer' ? 'direct_answer' : 'body_md';
    setEditing({ comment: c, field, value: page[field] || '' });
  };

  return (
    <div className="rv">
      <div className="rv-wrap">
        <div className="rv-bar">
          <span className="rv-badge">Director</span>
          <span className="rv-bar-title">Moderation queue</span>
          <span className="rv-spacer" />
          <a className="rv-link" href="/review">Pages</a>
          <button className={`rv-link${tab === 'queue' ? ' on' : ''}`} style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => setTab('queue')}>Queue</button>
          <button className={`rv-link${tab === 'history' ? ' on' : ''}`} style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => setTab('history')}>History</button>
          <button className={`rv-link${tab === 'team' ? ' on' : ''}`} style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => setTab('team')}>Team</button>
          <span className="rv-who">{dirName || name}</span>
        </div>
      </div>

      <div className="rv-wrap" style={{ paddingBottom: 90 }}>
        {tab === 'queue' && (
          <>
            <div className="rv-q-tools">
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="open">Open</option>
                <option value="accepted">Accepted</option>
                <option value="ignored">Ignored</option>
                <option value="all">All statuses</option>
              </select>
              <select value={filterPage} onChange={(e) => setFilterPage(e.target.value)}>
                <option value="all">All pages</option>
                {pages.map((p) => <option key={p.slug} value={p.slug}>{p.title.slice(0, 60)}</option>)}
              </select>
              <span className="rv-q-meta">{rows.length} shown · {comments.filter((c) => c.status === 'open').length} open in total</span>
            </div>

            {rows.length === 0 && <p className="rv-empty">Nothing here.</p>}

            {rows.map((c) => (
              <div className="rv-q-item" key={c.id}>
                <div className="rv-q-head">
                  <span className="rv-q-page">{pageBySlug[c.slug]?.title || c.slug}</span>
                  <span className="rv-q-meta">{c.reviewer_name} · {new Date(c.created_at).toLocaleString()}</span>
                  {c.flag_delete && <span className="rv-tag del">delete</span>}
                  {c.status === 'accepted' && <span className="rv-tag acc">accepted</span>}
                  {c.status === 'ignored' && <span className="rv-tag ign">ignored</span>}
                  {!anchored[c.id] && <span className="rv-tag un">unanchored</span>}
                </div>

                <div className="rv-q-quote">“{c.selected_text}”</div>
                {c.comment_body && <div className="rv-q-body">{c.comment_body}</div>}
                {!anchored[c.id] && (
                  <p className="rv-hint">
                    This quote is no longer in the page — the text has changed since the comment was left.
                    It can still be resolved.
                  </p>
                )}

                {c.status === 'open' && (
                  <div className="rv-q-actions">
                    <button className="rv-btn small" disabled={busy} onClick={() => openEditor(c)}>Accept + edit</button>
                    <button className="rv-btn ghost small" disabled={busy}
                      onClick={() => act(() => director({ action: 'resolve', passphrase: pass, director_name: dirName, comment_id: c.id, status: 'ignored' }))}>
                      Ignore
                    </button>
                    <a className="rv-btn ghost small" href={`/review?p=${encodeURIComponent(c.slug)}`}
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Open page</a>
                  </div>
                )}
                {c.status !== 'open' && (
                  <div className="rv-q-actions">
                    <span className="rv-q-meta">
                      {c.status} by {c.resolved_by || '—'}{c.resolved_at ? ` · ${new Date(c.resolved_at).toLocaleString()}` : ''}
                    </span>
                    <button className="rv-btn ghost small" disabled={busy}
                      onClick={() => act(() => director({ action: 'resolve', passphrase: pass, director_name: dirName, comment_id: c.id, status: 'open' }))}>
                      Reopen
                    </button>
                  </div>
                )}

                {editing && editing.comment.id === c.id && (
                  <div className="rv-edit">
                    <div className="rv-q-tools" style={{ margin: '0 0 8px' }}>
                      <select value={editing.field} onChange={(e) => {
                        const f = e.target.value;
                        setEditing({ ...editing, field: f, value: pageBySlug[c.slug]?.[f] || '' });
                      }}>
                        <option value="body_md">body_md</option>
                        <option value="direct_answer">direct_answer</option>
                        <option value="title">title</option>
                        <option value="meta_description">meta_description</option>
                      </select>
                      <span className="rv-q-meta">editing {pageBySlug[c.slug]?.title}</span>
                    </div>
                    <p className="rv-hint">
                      The quoted text is “{c.selected_text.slice(0, 90)}”. Edit it below, or delete the span if it
                      is flagged. Saving snapshots the page first, so this is revertable from History.
                    </p>
                    <EditTextarea
                      value={editing.value}
                      onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                      comment={c}
                      field={editing.field}
                    />
                    <div className="rv-q-actions" style={{ marginTop: 10 }}>
                      <button className="rv-btn small" disabled={busy} onClick={() => act(async () => {
                        await director({
                          action: 'edit', passphrase: pass, director_name: dirName,
                          slug: c.slug, field: editing.field, value: editing.value, comment_id: c.id
                        });
                        setEditing(null);
                      })}>{busy ? 'Saving…' : 'Save + accept'}</button>
                      <button className="rv-btn ghost small" onClick={() => setEditing(null)}>Cancel</button>
                      {c.flag_delete && (
                        <button className="rv-btn danger small" disabled={busy} onClick={() => {
                          setEditing({ ...editing, value: editing.value.split(c.selected_text).join('') });
                        }}>Remove the flagged text</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {tab === 'team' && (() => {
          const nameOf = Object.fromEntries(team.map((t) => [t.id, t.name]));
          const bySlug = {};
          for (const a of assignments) (bySlug[a.slug] ||= []).push(a);
          const visible = pages
            .filter((p) => (assignFilter ? p.title.toLowerCase().includes(assignFilter.toLowerCase()) : true))
            .sort((a, b) => a.title.localeCompare(b.title));

          return (
            <>
              <div className="rv-field-label" style={{ marginTop: 22 }}>Team</div>
              <p className="rv-hint">
                Reviewers pick their name from this roster when they sign in. Removing someone also
                removes their assignments.
              </p>
              <div className="rv-team">
                {team.map((t) => (
                  <span className="rv-member" key={t.id}>
                    {t.name}
                    <button title={`Remove ${t.name}`} disabled={busy} onClick={() => {
                      if (!confirm(`Remove ${t.name} from the roster? Their assignments go too; their comments stay.`)) return;
                      act(() => director({ action: 'team_remove', passphrase: pass, director_name: dirName, member_id: t.id }));
                    }}>×</button>
                  </span>
                ))}
                {team.length === 0 && <span className="rv-q-meta">Nobody on the roster yet.</span>}
              </div>
              <div className="rv-q-tools" style={{ margin: '0 0 26px' }}>
                <input
                  type="text" placeholder="Add a team member" value={newMember}
                  onChange={(e) => setNewMember(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && newMember.trim()) {
                    act(async () => { await director({ action: 'team_add', passphrase: pass, director_name: dirName, name: newMember.trim() }); setNewMember(''); });
                  } }}
                />
                <button className="rv-btn small" disabled={busy || !newMember.trim()} onClick={() => {
                  act(async () => { await director({ action: 'team_add', passphrase: pass, director_name: dirName, name: newMember.trim() }); setNewMember(''); });
                }}>Add</button>
              </div>

              <div className="rv-field-label">Assignments</div>
              <p className="rv-hint">
                Assign as many people to an article as you like. Assignment guides the reviewer list —
                it does not stop anyone reading or commenting on anything.
              </p>
              <div className="rv-q-tools" style={{ margin: '0 0 8px' }}>
                <input type="text" placeholder="Filter articles" value={assignFilter}
                  onChange={(e) => setAssignFilter(e.target.value)} />
                <span className="rv-q-meta">{visible.length} of {pages.length} articles · {assignments.length} assignments</span>
              </div>

              {team.length === 0 && <p className="rv-empty">Add someone to the roster first.</p>}

              {team.length > 0 && visible.map((p) => {
                const mine = (bySlug[p.slug] || []);
                const assignedIds = new Set(mine.map((a) => a.team_member_id));
                return (
                  <div className="rv-assign-row" key={p.slug}>
                    <span className="t">{p.title}</span>
                    <span className="rv-chips">
                      {mine.map((a) => (
                        <span className="rv-chip" key={a.id}>
                          {nameOf[a.team_member_id] || 'unknown'}
                          <button
                            style={{ background: 'none', border: 0, cursor: 'pointer', marginLeft: 6, color: 'inherit' }}
                            title="Unassign" disabled={busy}
                            onClick={() => act(() => director({ action: 'unassign', passphrase: pass, director_name: dirName, slug: p.slug, member_id: a.team_member_id }))}
                          >×</button>
                        </span>
                      ))}
                      {mine.length === 0 && <span className="rv-q-meta">unassigned</span>}
                    </span>
                    <select value="" disabled={busy} onChange={(e) => {
                      const id = e.target.value; if (!id) return;
                      act(() => director({ action: 'assign', passphrase: pass, director_name: dirName, slug: p.slug, member_id: id }));
                    }}>
                      <option value="">Assign…</option>
                      {team.filter((t) => !assignedIds.has(t.id)).map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
              <div style={{ height: 60 }} />
            </>
          );
        })()}

        {tab === 'history' && (
          <>
            <div className="rv-q-tools">
              <select value={filterPage} onChange={(e) => setFilterPage(e.target.value)}>
                <option value="all">All pages</option>
                {pages.map((p) => <option key={p.slug} value={p.slug}>{p.title.slice(0, 60)}</option>)}
              </select>
              <span className="rv-q-meta">{versions.length} snapshots</span>
            </div>
            <p className="rv-hint">
              Each snapshot is the page as it was immediately before a change. Reverting restores it — and
              snapshots the current state first, so a revert can itself be reverted.
            </p>
            {versions
              .filter((v) => (filterPage === 'all' ? true : v.slug === filterPage))
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              .map((v) => (
                <div className="rv-ver" key={v.id}>
                  <span className="t">{pageBySlug[v.slug]?.title || v.slug}</span>
                  <span className="n">{new Date(v.created_at).toLocaleString()}</span>
                  <span className="by">{v.edited_by || '—'}</span>
                  <span className="n">{v.note}</span>
                  <span className="rv-spacer" />
                  <button className="rv-btn ghost small" disabled={busy} onClick={() => {
                    if (!confirm('Restore this snapshot over the current page?')) return;
                    act(() => director({ action: 'revert', passphrase: pass, director_name: dirName, version_id: v.id }));
                  }}>Revert to this</button>
                </div>
              ))}
            {versions.length === 0 && <p className="rv-empty">No edits have been made yet.</p>}
          </>
        )}
      </div>
    </div>
  );
}
