import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAll, configError } from '../supabase.js';
import { locate } from './anchor.js';
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
  const [pass, setPass] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <div className="rv"><div className="rv-gate">
      <h1>Editorial director</h1>
      <p>Accepting, editing and reverting is director-only. The passphrase is checked on the server.</p>
      <form onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr('');
        try { await director({ action: 'verify', passphrase: pass, director_name: name }); onUnlock(pass); }
        catch (ex) { setErr(String(ex.message)); }
        setBusy(false);
      }}>
        <input type="password" placeholder="Director passphrase" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus />
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
  const [pages, setPages] = useState(null);
  const [comments, setComments] = useState([]);
  const [versions, setVersions] = useState([]);
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
        fetchAll('page_versions', 'id, slug, note, created_at')
      ]);
      setPages(p); setComments(c); setVersions(v);
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
  if (!pass) return <DirectorGate name={name} onUnlock={setPass} />;
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
          <span className="rv-who">{name}</span>
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
                      onClick={() => act(() => director({ action: 'resolve', passphrase: pass, director_name: name, comment_id: c.id, status: 'ignored' }))}>
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
                      onClick={() => act(() => director({ action: 'resolve', passphrase: pass, director_name: name, comment_id: c.id, status: 'open' }))}>
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
                    <textarea value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })} />
                    <div className="rv-q-actions" style={{ marginTop: 10 }}>
                      <button className="rv-btn small" disabled={busy} onClick={() => act(async () => {
                        await director({
                          action: 'edit', passphrase: pass, director_name: name,
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
                  <span className="n">{new Date(v.created_at).toLocaleString()} · {v.note}</span>
                  <span className="rv-spacer" />
                  <button className="rv-btn ghost small" disabled={busy} onClick={() => {
                    if (!confirm('Restore this snapshot over the current page?')) return;
                    act(() => director({ action: 'revert', passphrase: pass, director_name: name, version_id: v.id }));
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
