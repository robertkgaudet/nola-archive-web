import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, fetchAll, configError } from '../supabase.js';
import { THEMES, themeFor } from '../themeMap.js';
import { makeAnchor, locate, segment } from './anchor.js';
import './review.css';

const REVIEW_PASSPHRASE = import.meta.env.VITE_REVIEW_PASSPHRASE || '';

/**
 * Comment edits and deletes go through the edge function, never through a raw
 * anon UPDATE or DELETE — granting those to anon would expose the whole table.
 * The function checks the review passphrase server-side, so any signed-in
 * reviewer may amend or remove any comment while the write itself stays off
 * the public key.
 */
async function reviewAction(payload) {
  const res = await fetch('/api/director', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, passphrase: REVIEW_PASSPHRASE })
  });
  let j = null;
  try { j = await res.json(); } catch { /* non-json */ }
  if (!res.ok || !j?.ok) throw new Error(j?.error || `Request failed (${res.status})`);
  return j;
}

/* ---------------- markdown → blocks ----------------
   The same narrow subset the generator emits. Each text-bearing block gets an
   index; that index is what an anchor remembers, and the block's plain text is
   what the anchor quotes. */
export function toBlocks(md) {
  if (!md) return [];
  const out = [];
  let para = [];
  const flush = () => { if (para.length) { out.push({ type: 'p', text: para.join(' ') }); para = []; } };
  for (const raw of String(md).replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flush(); out.push({ type: 'h', level: h[1].length, text: h[2] }); continue; }
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) { flush(); out.push({ type: 'li', text: li[1] }); continue; }
    para.push(line.trim());
  }
  flush();
  return out;
}

const stripCta = (md) => String(md || '').replace(/\{\{CTA_RFP\}\}/g, '').trim();

/* ---------------- gate ---------------- */
function Gate({ onEnter }) {
  const [pass, setPass] = useState('');
  const [name, setName] = useState(localStorage.getItem('rv_name') || '');
  const [err, setErr] = useState('');
  const [team, setTeam] = useState(null);   // null = still loading

  // The roster is readable by anon so the picker can be populated before the
  // passphrase is entered. Names only — nothing sensitive.
  useEffect(() => {
    (async () => {
      try { setTeam(await fetchAll('review_team', 'id, name')); }
      catch { setTeam([]); }   // table missing or unreadable: fall back to free text
    })();
  }, []);

  const submit = (e) => {
    e.preventDefault();
    if (!REVIEW_PASSPHRASE) { setErr('No review passphrase is configured for this build.'); return; }
    if (pass !== REVIEW_PASSPHRASE) { setErr('That passphrase is not right.'); return; }
    if (!name.trim()) { setErr('Please add your name so your comments are attributed.'); return; }
    localStorage.setItem('rv_name', name.trim());
    localStorage.setItem('rv_ok', '1');
    onEnter(name.trim());
  };

  return (
    <div className="rv"><div className="rv-gate">
      <h1>Review</h1>
      <p>This is the working copy of the answer pages. Add a passphrase and your name to leave comments.</p>
      <form onSubmit={submit}>
        <input type="password" placeholder="Passphrase" value={pass}
          onChange={(e) => { setPass(e.target.value); setErr(''); }} autoFocus />
        {team && team.length > 0 ? (
          <select value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} className="rv-select">
            <option value="">Choose your name…</option>
            {team.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
          </select>
        ) : (
          <input type="text" placeholder="Your name" value={name}
            onChange={(e) => { setName(e.target.value); setErr(''); }} />
        )}
        {err && <p className="rv-err">{err}</p>}
        <button className="rv-btn" type="submit" style={{ width: '100%' }}>Enter</button>
        {team && team.length === 0 && (
          <p className="rv-hint" style={{ marginTop: 12 }}>
            No team roster yet — type your name. The director can add people from the queue.
          </p>
        )}
      </form>
    </div></div>
  );
}

/* ---------------- one annotatable block ---------------- */
function Block({ block, field, idx, ranges, onOpen }) {
  const marks = ranges.filter((r) => r.field === field && r.paraIndex === idx);
  const parts = marks.length ? segment(block.text, marks) : [{ text: block.text, ids: [] }];

  const inner = parts.map((p, i) =>
    p.ids.length ? (
      <mark
        key={i}
        className={
          'rv-mark' +
          (marks.some((m) => p.ids.includes(m.id) && m.flag_delete) ? ' del' : '') +
          (p.ids.length > 1 ? ' multi' : '') +
          (p.ids.includes('__pending__') ? ' pending' : '')
        }
        onClick={(e) => {
          e.stopPropagation();
          const real = p.ids.filter((x) => x !== '__pending__');
          if (real.length) onOpen(real, e.currentTarget);
        }}
        title={`${p.ids.length} comment${p.ids.length > 1 ? 's' : ''}`}
      >{p.text}</mark>
    ) : <span key={i}>{p.text}</span>
  );

  const attrs = { 'data-block': '1', 'data-field': field, 'data-idx': idx };
  if (block.type === 'h') {
    const T = `h${Math.min(block.level + 1, 4)}`;
    return <T {...attrs}>{inner}</T>;
  }
  if (block.type === 'li') return <li {...attrs}>{inner}</li>;
  return <p {...attrs}>{inner}</p>;
}

/**
 * The attribution columns arrive with migration 008. Until it is run, asking
 * for them fails the whole query (42703) and the page would show no comments
 * at all, so fall back to the columns that have always existed.
 */
const COMMENT_COLS = 'id, slug, reviewer_name, selected_text, anchor, comment_body, flag_delete, status, created_at, edited_by, edited_at';
const COMMENT_COLS_BASE = 'id, slug, reviewer_name, selected_text, anchor, comment_body, flag_delete, status, created_at';
let commentCols = COMMENT_COLS;

async function loadComments() {
  try {
    return await fetchAll('page_comments', commentCols);
  } catch (e) {
    if (commentCols === COMMENT_COLS_BASE) throw e;
    commentCols = COMMENT_COLS_BASE;
    return await fetchAll('page_comments', commentCols);
  }
}

/* ---------------- saved-comment popup: view, edit, delete ---------------- */
function CommentCard({ c, reviewer, onDone, onClose }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(c.comment_body || '');
  const [flag, setFlag] = useState(!!c.flag_delete);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function run(fn) {
    setBusy(true); setErr('');
    try { await fn(); await onDone(); }
    catch (e) { setErr(String(e.message)); }
    setBusy(false);
  }

  return (
    <>
      <div className="hd">
        <span className="who">{c.reviewer_name}</span>
        <span className="when">{new Date(c.created_at).toLocaleString()}</span>
        {c.flag_delete && <span className="rv-tag del">delete</span>}
        {c.status === 'accepted' && <span className="rv-tag acc">accepted</span>}
        {c.status === 'ignored' && <span className="rv-tag ign">ignored</span>}
      </div>
      <div className="q">“{c.selected_text}”</div>

      {!editing && (
        <>
          {c.comment_body ? <div className="b">{c.comment_body}</div>
            : <div className="b" style={{ color: 'var(--mute)' }}>No comment — flagged only.</div>}
          {c.edited_by && (
            <div className="rv-edited">
              edited by {c.edited_by}{c.edited_at ? ` · ${new Date(c.edited_at).toLocaleString()}` : ''}
            </div>
          )}
          {err && <p className="rv-err" style={{ margin: '8px 0 0' }}>{err}</p>}
          <div className="acts">
            <button className="rv-btn ghost small" onClick={() => setEditing(true)} disabled={busy}>Edit</button>
            <button className="rv-btn danger small" disabled={busy} onClick={() => {
              if (!confirm('Delete this comment? The highlight goes with it.')) return;
              run(() => reviewAction({ action: 'comment_delete', actor_name: reviewer, comment_id: c.id }));
            }}>Delete</button>
            <span className="rv-spacer" />
            <button className="rv-btn ghost small" onClick={onClose} disabled={busy}>Close</button>
          </div>
        </>
      )}

      {editing && (
        <>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} autoFocus
            placeholder="What needs changing?" />
          {err && <p className="rv-err" style={{ margin: '8px 0 0' }}>{err}</p>}
          <div className="acts">
            <label><input type="checkbox" checked={flag} onChange={(e) => setFlag(e.target.checked)} /> Mark for deletion</label>
            <span className="rv-spacer" />
            <button className="rv-btn ghost small" onClick={() => {
              setEditing(false); setBody(c.comment_body || ''); setFlag(!!c.flag_delete); setErr('');
            }} disabled={busy}>Cancel</button>
            <button className="rv-btn small" disabled={busy || (!body.trim() && !flag)} onClick={() => run(async () => {
              await reviewAction({
                action: 'comment_edit', actor_name: reviewer, comment_id: c.id,
                comment_body: body.trim() || null, flag_delete: flag
              });
              setEditing(false);
            })}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </>
      )}
    </>
  );
}

/* ---------------- article in review mode ---------------- */
function Article({ page, comments, reviewer, onSaved, onBack }) {
  const [sel, setSel] = useState(null);      // { field, idx, start, end, quote, x, y }
  const [body, setBody] = useState('');
  const [flag, setFlag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState([]);  // comment ids opened from a highlight
  const [viewing, setViewing] = useState(null); // { ids, x, y } — the view/edit popup
  const wrapRef = useRef(null);

  const fields = useMemo(() => ({
    direct_answer: page.direct_answer ? [{ type: 'p', text: page.direct_answer }] : [],
    body_md: toBlocks(stripCta(page.body_md))
  }), [page]);

  // resolve every comment against the current text
  const { ranges, unanchored } = useMemo(() => {
    const ok = [], bad = [];
    for (const c of comments) {
      const field = c.anchor?.field === 'direct_answer' ? 'direct_answer' : 'body_md';
      const texts = (fields[field] || []).map((b) => b.text);
      const hit = locate(c.anchor, texts);
      if (hit) ok.push({ id: c.id, field, paraIndex: hit.paraIndex, start: hit.start, end: hit.end, flag_delete: c.flag_delete });
      else bad.push(c);
    }
    return { ranges: ok, unanchored: bad };
  }, [comments, fields]);

  const byId = useMemo(() => Object.fromEntries(comments.map((c) => [c.id, c])), [comments]);

  // While the popover is open the browser drops its own selection paint as soon
  // as focus moves to the textarea. Render the pending range as a real mark so
  // the reviewer keeps seeing exactly what they are annotating until they save
  // or cancel. It turns red the moment "mark for deletion" is ticked.
  const PENDING = '__pending__';
  const paintedRanges = useMemo(() => (
    sel
      ? [...ranges, { id: PENDING, field: sel.field, paraIndex: sel.idx, start: sel.start, end: sel.end, flag_delete: flag, pending: true }]
      : ranges
  ), [ranges, sel, flag]);

  const openComments = useCallback((ids, el) => {
    setActive(ids);
    const host = wrapRef.current?.getBoundingClientRect();
    if (el && host) {
      const r = el.getBoundingClientRect();
      setViewing({ ids, x: Math.max(0, r.left - host.left), y: r.bottom - host.top + 8 });
    } else {
      setViewing({ ids, x: 0, y: 0, inline: true });
    }
  }, []);

  const onMouseUp = useCallback(() => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) { setSel(null); return; }
    setViewing(null);
    const range = s.getRangeAt(0);
    const el = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement)
      ?.closest('[data-block]');
    if (!el || !wrapRef.current?.contains(el)) { setSel(null); return; }

    // offset within the block, measured against its own text
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const quote = range.toString();
    if (!quote.trim()) { setSel(null); return; }

    const rect = range.getBoundingClientRect();
    const host = wrapRef.current.getBoundingClientRect();
    setSel({
      field: el.getAttribute('data-field'),
      idx: Number(el.getAttribute('data-idx')),
      start,
      end: start + quote.length,
      quote,
      x: Math.max(0, rect.left - host.left),
      y: rect.bottom - host.top + 10
    });
    setBody(''); setFlag(false);
    // let the mouseup finish, then clear the native selection — our mark has it
    setTimeout(() => window.getSelection()?.removeAllRanges(), 0);
  }, []);

  async function save() {
    if (!sel) return;
    if (!body.trim() && !flag) return;
    setBusy(true);
    const paragraph = (fields[sel.field] || [])[sel.idx]?.text || '';
    const anchor = makeAnchor({ field: sel.field, paraIndex: sel.idx, paragraph, start: sel.start, end: sel.end });
    const { error } = await supabase.from('page_comments').insert({
      page_id: page.id, slug: page.slug, reviewer_name: reviewer,
      selected_text: sel.quote, anchor, comment_body: body.trim() || null, flag_delete: flag
    });
    setBusy(false);
    if (error) { alert(`Could not save: ${error.message}`); return; }
    window.getSelection()?.removeAllRanges();
    setSel(null);
    onSaved();
  }

  const shown = active.length ? active.map((id) => byId[id]).filter(Boolean) : comments;

  return (
    <div className="rv-wrap">
      <div className="rv-narrow rv-article" ref={wrapRef} style={{ position: 'relative' }} onMouseUp={onMouseUp}>
        <button className="rv-btn ghost small" onClick={onBack} style={{ marginBottom: 26 }}>← All pages</button>
        <h1>{page.title}</h1>

        {fields.direct_answer.length > 0 && (
          <>
            <div className="rv-field-label">Direct answer</div>
            <div className="rv-dek">
              {fields.direct_answer.map((b, i) => (
                <Block key={i} block={b} field="direct_answer" idx={i} ranges={paintedRanges} onOpen={openComments} />
              ))}
            </div>
          </>
        )}

        <div className="rv-field-label">Body</div>
        <div className="rv-body">
          {fields.body_md.map((b, i) => (
            <Block key={i} block={b} field="body_md" idx={i} ranges={paintedRanges} onOpen={openComments} />
          ))}
        </div>

        {sel && (
          <div className="rv-pop" style={{ left: sel.x, top: sel.y }} onMouseUp={(e) => e.stopPropagation()}>
            <p className="quote">{sel.quote.slice(0, 180)}</p>
            <textarea
              placeholder="What needs changing?"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              autoFocus
            />
            <div className="rv-pop-row">
              <label><input type="checkbox" checked={flag} onChange={(e) => setFlag(e.target.checked)} /> Mark for deletion</label>
              <span className="rv-spacer" />
              <button className="rv-btn ghost small" onClick={() => setSel(null)}>Cancel</button>
              <button className="rv-btn small" onClick={save} disabled={busy || (!body.trim() && !flag)}>
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {viewing && !viewing.inline && (
          <div className="rv-view" style={{ left: viewing.x, top: viewing.y }} onMouseUp={(e) => e.stopPropagation()}>
            {viewing.ids.map((id, i) => byId[id] ? (
              <div key={id}>
                {i > 0 && <div className="sep" />}
                <CommentCard
                  c={byId[id]}
                  reviewer={reviewer}
                  onDone={async () => { await onSaved(); setViewing(null); setActive([]); }}
                  onClose={() => { setViewing(null); setActive([]); }}
                />
              </div>
            ) : null)}
          </div>
        )}

        <div className="rv-field-label" style={{ marginTop: 46 }}>
          Comments ({comments.length}){active.length > 0 && (
            <button className="rv-btn ghost small" style={{ marginLeft: 10 }} onClick={() => setActive([])}>show all</button>
          )}
        </div>
        <div className="rv-notes">
          {shown.length === 0 && <p className="rv-empty">No comments yet. Select any text above to leave one.</p>}
          {shown.map((c) => (
            <div key={c.id}
              className={`rv-note${c.flag_delete ? ' del' : ''}${active.includes(c.id) ? ' active' : ''}`}
              role="button" tabIndex={0} style={{ cursor: 'pointer' }}
              onClick={() => setViewing({ ids: [c.id], inline: true })}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewing({ ids: [c.id], inline: true }); } }}>
              <span className="who">{c.reviewer_name}</span>
              <span className="when">{new Date(c.created_at).toLocaleString()}</span>
              {c.flag_delete && <span className="rv-tag del">delete</span>}
              {c.status === 'accepted' && <span className="rv-tag acc">accepted</span>}
              {c.status === 'ignored' && <span className="rv-tag ign">ignored</span>}
              {unanchored.some((u) => u.id === c.id) && <span className="rv-tag un">text moved</span>}
              <div className="q">“{c.selected_text}”</div>
              {c.comment_body && <div className="b">{c.comment_body}</div>}
              {c.edited_by && <div className="rv-edited">edited by {c.edited_by}</div>}
              {viewing?.inline && viewing.ids.includes(c.id) && (
                <div className="rv-view" style={{ position: 'static', width: 'auto', marginTop: 10, boxShadow: 'none' }}
                  onClick={(e) => e.stopPropagation()}>
                  <CommentCard
                    c={c}
                    reviewer={reviewer}
                    onDone={async () => { await onSaved(); setViewing(null); }}
                    onClose={() => setViewing(null)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- surface ---------------- */
export default function Review() {
  const [ok, setOk] = useState(() => localStorage.getItem('rv_ok') === '1' && !!localStorage.getItem('rv_name'));
  const [reviewer, setReviewer] = useState(() => localStorage.getItem('rv_name') || '');
  const [pages, setPages] = useState(null);
  const [comments, setComments] = useState([]);
  const [team, setTeam] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [scope, setScope] = useState('all');   // all | me | a roster name
  const [err, setErr] = useState(configError);
  const [open, setOpen] = useState(() => new URLSearchParams(window.location.search).get('p'));

  const load = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        fetchAll('pages', 'id, slug, title, direct_answer, body_md'),
        loadComments()
      ]);
      setPages(p.sort((a, b) => a.title.localeCompare(b.title)));
      setComments(c);
      // roster and assignments are optional — absent before migration 007
      try {
        const [t, a] = await Promise.all([
          fetchAll('review_team', 'id, name'),
          fetchAll('page_assignments', 'id, slug, team_member_id')
        ]);
        setTeam(t); setAssignments(a);
      } catch { setTeam([]); setAssignments([]); }
    } catch (e) { setErr(e.message); }
  }, []);

  useEffect(() => { if (ok && !configError) load(); }, [ok, load]);

  if (!ok) return <Gate onEnter={(n) => { setReviewer(n); setOk(true); }} />;
  if (err) return <div className="rv"><div className="rv-wrap" style={{ paddingTop: 70 }}>
    Cannot load: {err}<p className="rv-hint">If this mentions a missing table, migration 006 has not been run yet.</p></div></div>;
  if (!pages) return <div className="rv"><div className="rv-wrap" style={{ paddingTop: 70 }}>Loading…</div></div>;

  const byPage = {};
  for (const c of comments) (byPage[c.slug] ||= []).push(c);
  const current = open ? pages.find((p) => p.slug === open) : null;

  const nameOf = Object.fromEntries(team.map((t) => [t.id, t.name]));
  const assignedTo = {};   // slug -> [names]
  for (const a of assignments) {
    const n = nameOf[a.team_member_id];
    if (n) (assignedTo[a.slug] ||= []).push(n);
  }
  // Filtering is a convenience only — every page stays openable by anyone.
  const inScope = (slug) => {
    if (scope === 'all') return true;
    const names = assignedTo[slug] || [];
    return names.includes(scope === 'me' ? reviewer : scope);
  };

  return (
    <div className="rv">
      <div className="rv-wrap">
        <div className="rv-bar">
          <span className="rv-badge">Review</span>
          <span className="rv-bar-title">{current ? 'Reading' : 'The answer pages'}</span>
          <span className="rv-spacer" />
          <a className="rv-link on" href="/review">Pages</a>
          <a className="rv-link" href="/review/queue">Queue</a>
          <span className="rv-who">{reviewer}</span>
          <button className="rv-btn ghost small" onClick={() => {
            localStorage.removeItem('rv_ok'); setOk(false);
          }}>Sign out</button>
        </div>
      </div>

      {current ? (
        <Article
          page={current}
          comments={(byPage[current.slug] || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))}
          reviewer={reviewer}
          onSaved={load}
          onBack={() => setOpen(null)}
        />
      ) : (
        <div className="rv-wrap">
          <div className="rv-q-tools" style={{ marginBottom: 4 }}>
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">All articles</option>
              <option value="me">Assigned to me</option>
              {team.filter((t) => t.name !== reviewer).map((t) => (
                <option key={t.id} value={t.name}>Assigned to {t.name}</option>
              ))}
            </select>
            <span className="rv-q-meta">
              {scope === 'all'
                ? `${pages.length} articles`
                : `${pages.filter((p) => inScope(p.slug)).length} of ${pages.length} articles`}
            </span>
          </div>
          <p className="rv-hint" style={{ margin: '0 0 6px' }}>
            Open a page, then select any words to leave a comment or mark them for deletion.
            Assignments are a guide — anyone can read and comment on anything.
          </p>
          {THEMES.map((theme) => {
            const items = pages.filter((p) => themeFor(p.slug) === theme).filter((p) => inScope(p.slug));
            if (!items.length) return null;
            return (
              <section key={theme} style={{ marginTop: 34 }}>
                <div className="rv-field-label" style={{ margin: '0 0 6px' }}>{theme}</div>
                <div className="rv-list">
                  {items.map((p) => {
                    const n = (byPage[p.slug] || []).filter((c) => c.status === 'open').length;
                    return (
                      <button className="rv-row" key={p.slug} onClick={() => setOpen(p.slug)}>
                        <span>
                          <h3>{p.title}</h3>
                          {(assignedTo[p.slug] || []).length > 0 && (
                            <span className="rv-chips">
                              {(assignedTo[p.slug] || []).map((nm) => (
                                <span className={`rv-chip${nm === reviewer ? ' me' : ''}`} key={nm}>{nm}</span>
                              ))}
                            </span>
                          )}
                        </span>
                        <span className="rv-theme">{theme}</span>
                        <span className={`rv-count${n ? '' : ' zero'}`}>{n} open</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          <div style={{ height: 80 }} />
        </div>
      )}
    </div>
  );
}
