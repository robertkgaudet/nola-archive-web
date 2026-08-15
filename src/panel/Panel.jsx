import { useEffect, useMemo, useState } from 'react';
import { fetchAll, configError } from '../supabase.js';
import { THEMES, themeFor } from '../themeMap.js';
import './panel.css';

const words = (s) => (s || '').replace(/\{\{CTA_RFP\}\}/g, ' ').trim().split(/\s+/).filter(Boolean).length;

// Publishing needs columns the pages table does not have yet. Probe rather
// than assume, so the section activates by itself once the migration lands.
const PUBLISH_COLS = ['scheduled_date', 'published_url'];

export default function Panel() {
  const [pages, setPages] = useState(null);
  const [err, setErr] = useState(configError);
  const [hasPublishCols, setHasPublishCols] = useState(false);
  const [sort, setSort] = useState({ key: 'words', dir: 'desc' });

  useEffect(() => {
    if (configError) return;
    (async () => {
      try {
        const rows = await fetchAll(
          'pages',
          'slug, title, body_md, faq, related_slugs, status, shield_status, shield_hits, claim_audit_status, claim_audit_issues'
        );
        setPages(rows);
        try {
          await fetchAll('pages', PUBLISH_COLS.join(', '));
          setHasPublishCols(true);
        } catch { setHasPublishCols(false); }
      } catch (e) { setErr(e.message); }
    })();
  }, []);

  const m = useMemo(() => {
    if (!pages) return null;
    const rows = pages.map((p) => ({
      ...p,
      theme: themeFor(p.slug),
      words: words(p.body_md),
      faqCount: (p.faq || []).length,
      relCount: (p.related_slugs || []).length
    }));
    const total = rows.reduce((a, r) => a + r.words, 0);
    const sorted = [...rows].sort((a, b) => a.words - b.words);
    const byTheme = {};
    for (const r of rows) byTheme[r.theme] = (byTheme[r.theme] || 0) + 1;
    const byStatus = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    return {
      rows, total, byTheme, byStatus,
      avg: Math.round(total / rows.length),
      shortest: sorted[0], longest: sorted[sorted.length - 1],
      withFaq: rows.filter((r) => r.faqCount > 0).length,
      avgFaq: (rows.reduce((a, r) => a + r.faqCount, 0) / rows.length).toFixed(1),
      links: rows.reduce((a, r) => a + r.relCount, 0),
      linked: rows.filter((r) => r.relCount > 0).length,
      shieldClean: rows.filter((r) => r.shield_status === 'clean').length,
      shieldFlagged: rows.filter((r) => r.shield_status === 'flagged'),
      claimPass: rows.filter((r) => r.claim_audit_status === 'pass').length,
      claimFail: rows.filter((r) => r.claim_audit_status !== 'pass'),
      needsApproval: rows.filter((r) => r.status === 'draft')
    };
  }, [pages]);

  const sorted = useMemo(() => {
    if (!m) return [];
    const { key, dir } = sort;
    return [...m.rows].sort((a, b) => {
      const va = a[key], vb = b[key];
      const c = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return dir === 'asc' ? c : -c;
    });
  }, [m, sort]);

  const th = (key, label) => (
    <th onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))}>
      {label}{sort.key === key && <span className="arrow"> {sort.dir === 'desc' ? '▼' : '▲'}</span>}
    </th>
  );

  if (err) return <div className="pnl"><div className="pnl-wrap" style={{ paddingTop: 60 }}>Cannot load: {err}</div></div>;
  if (!m) return <div className="pnl"><div className="pnl-wrap" style={{ paddingTop: 60 }}>Loading…</div></div>;

  const maxTheme = Math.max(...Object.values(m.byTheme));

  return (
    <div className="pnl">
      <div className="pnl-wrap">
        <header className="pnl-head">
          <div>
            <h1>Content Control Panel</h1>
            <p className="sub">NOLA DMC answer collection — {m.rows.length} pages</p>
          </div>
          <span className="stamp">read-only · updates as pages change</span>
        </header>

        {/* ---------- A. INVENTORY ---------- */}
        <section className="pnl-sec">
          <div className="pnl-sec-h"><h2>Content inventory</h2><span className="tag">live</span></div>
          <p className="pnl-note">
            Word counts and coverage across all pages — spot thin topics at a glance.
          </p>

          <div className="pnl-cards">
            <div className="pnl-card"><div className="v">{m.rows.length}</div><div className="k">Pages</div></div>
            <div className="pnl-card"><div className="v">{m.total.toLocaleString()}</div><div className="k">Total words</div></div>
            <div className="pnl-card"><div className="v">{m.avg}</div><div className="k">Average per page</div></div>
            <div className="pnl-card">
              <div className="v">{m.shortest.words}</div><div className="k">Shortest</div>
              <div className="h">{m.shortest.title.slice(0, 46)}…</div>
            </div>
            <div className="pnl-card">
              <div className="v">{m.longest.words}</div><div className="k">Longest</div>
              <div className="h">{m.longest.title.slice(0, 46)}…</div>
            </div>
          </div>

          <div className="pnl-cards" style={{ marginTop: 12 }}>
            <div className="pnl-card"><div className="v">{m.withFaq}</div><div className="k">Pages with FAQs</div>
              <div className="h">Out of {m.rows.length}</div></div>
            <div className="pnl-card"><div className="v">{m.avgFaq}</div><div className="k">Avg FAQ items</div></div>
            <div className="pnl-card"><div className="v">{m.links}</div><div className="k">Cross-links</div>
              <div className="h">{m.linked} pages link to a sibling</div></div>
          </div>

          <div className="pnl-bars">
            <p className="pnl-note" style={{ marginBottom: 10 }}>Pages per service theme.</p>
            {THEMES.map((t) => (
              <div className="pnl-bar" key={t}>
                <span className="lbl">{t}</span>
                <span className="track"><span className="fill" style={{ width: `${((m.byTheme[t] || 0) / maxTheme) * 100}%` }} /></span>
                <span className="n">{m.byTheme[t] || 0}</span>
              </div>
            ))}
          </div>

          <table className="pnl-t">
            <thead><tr>
              {th('title', 'Title')}{th('theme', 'Theme')}{th('words', 'Words')}
              {th('faqCount', 'FAQs')}{th('status', 'Status')}
            </tr></thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.slug}>
                  <td><a href={`/preview?p=${encodeURIComponent(r.slug)}`} target="_blank" rel="noreferrer">{r.title}</a></td>
                  <td style={{ color: 'var(--dim)' }}>{r.theme}</td>
                  <td className="num">{r.words}</td>
                  <td className="num">{r.faqCount}</td>
                  <td><span className={`pill ${r.status === 'approved' ? 'ok' : 'mute'}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ---------- B. READINESS ---------- */}
        <section className="pnl-sec">
          <div className="pnl-sec-h"><h2>Quality &amp; readiness</h2><span className="tag">live</span></div>
          <p className="pnl-note">
            Which pages passed the automated checks and which still need your sign-off before publishing.
          </p>

          <div className="pnl-cards">
            <div className={`pnl-card ${m.shieldFlagged.length ? '' : 'ok'}`}>
              <div className="v">{m.shieldClean}/{m.rows.length}</div><div className="k">Name check clean</div>
              <div className="h">No supplier named in the copy</div>
            </div>
            <div className={`pnl-card ${m.claimFail.length ? 'bad' : 'ok'}`}>
              <div className="v">{m.claimPass}/{m.rows.length}</div><div className="k">Facts traced</div>
              <div className="h">Every claim linked to its evidence</div>
            </div>
            <div className="pnl-card"><div className="v">{m.byStatus.draft || 0}</div><div className="k">Draft</div></div>
            <div className="pnl-card"><div className="v">{m.byStatus.review || 0}</div><div className="k">In review</div></div>
            <div className="pnl-card"><div className="v">{m.byStatus.approved || 0}</div><div className="k">Approved</div></div>
          </div>

          {(m.shieldFlagged.length > 0 || m.claimFail.length > 0) && (
            <div className="pnl-issues">
              {m.shieldFlagged.map((r) => (
                <div className="pnl-issue" key={'s' + r.slug}>
                  <div className="t"><span className="pill warn">name check</span> {r.title}</div>
                  <div className="d">
                    Matched: {(r.shield_hits || []).map((h) => `“${h.name}”`).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                    {' — '}review whether this is a real supplier mention or a business named after its own category.
                  </div>
                </div>
              ))}
              {m.claimFail.map((r) => (
                <div className="pnl-issue" key={'c' + r.slug}>
                  <div className="t"><span className="pill bad">facts</span> {r.title}</div>
                  <div className="d">{(r.claim_audit_issues || []).map((i) => i.problem).join('; ')}</div>
                </div>
              ))}
            </div>
          )}

          <div className="pnl-cards" style={{ marginTop: 12 }}>
            <div className="pnl-card">
              <div className="v">{m.needsApproval.length}</div>
              <div className="k">Awaiting your approval</div>
              <div className="h">Every page is draft until you approve it</div>
            </div>
          </div>
        </section>

        {/* ---------- C. PUBLISHING ---------- */}
        <section className="pnl-sec">
          <div className="pnl-sec-h"><h2>Publishing tracker</h2>
            <span className="tag">{hasPublishCols ? 'live' : 'awaiting delivery'}</span></div>
          <p className="pnl-note">
            Tracks what is live, scheduled, or still in draft once pages start going to the site.
          </p>

          <div className="pnl-cards">
            <div className="pnl-card"><div className="v">{m.byStatus.draft || 0}</div><div className="k">Draft</div></div>
            <div className="pnl-card"><div className="v">{m.byStatus.approved || 0}</div><div className="k">Approved</div></div>
            <div className="pnl-card"><div className="v">{hasPublishCols ? (m.byStatus.scheduled || 0) : 0}</div><div className="k">Scheduled</div></div>
            <div className="pnl-card"><div className="v">{m.byStatus.published || 0}</div><div className="k">Published</div></div>
          </div>

          {!hasPublishCols && (
            <div className="pnl-empty">
              <b>No pages published yet — activates once delivery is wired.</b>
              Scheduling and published-URL tracking need two columns the pages table does not
              have yet (<code>scheduled_date</code>, <code>published_url</code>). This section
              fills itself in automatically once that migration is applied and the first page
              is delivered — nothing here is mocked.
            </div>
          )}
        </section>

        <div className="pnl-foot">Reads the pages table only. No changes are made from this screen.</div>
      </div>
    </div>
  );
}
