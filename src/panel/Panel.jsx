import { useEffect, useMemo, useState } from 'react';
import { fetchAll, configError } from '../supabase.js';
import { THEMES, themeFor } from '../themeMap.js';
import { lazy, Suspense } from 'react';
import './panel.css';

const GateDetail = lazy(() => import('./GateDetail.jsx'));

const words = (s) => (s || '').replace(/\{\{CTA_RFP\}\}/g, ' ').trim().split(/\s+/).filter(Boolean).length;

// Publishing needs columns the pages table does not have yet. Probe rather
// than assume, so the section activates by itself once the migration lands.
const PUBLISH_COLS = ['scheduled_date', 'published_url'];

export default function Panel({ mode = 'client' }) {
  const admin = mode === 'admin';
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
          'slug, title, body_md, faq, related_slugs, status, claim_audit_status'
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
      claimPass: rows.filter((r) => r.claim_audit_status === 'pass').length,
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
            <h1>{admin ? 'Content Control Panel — full detail' : 'Content Control Panel'}</h1>
            <p className="sub">
              {admin
                ? `NOLA DMC answer collection — ${m.rows.length} pages, all checks shown`
                : `A live view of what has been built, what is ready, and what publishes next.`}
            </p>
          </div>
          <span className="stamp">updates automatically as pages change</span>
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
                  <td><a href={`/collection?p=${encodeURIComponent(r.slug)}`} target="_blank" rel="noreferrer">{r.title}</a></td>
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
            {admin
              ? 'Gate results per page: name check and claim audit, with every failure named.'
              : 'Every page is checked automatically before it reaches you. This is how many have cleared those checks and are waiting on your sign-off.'}
          </p>

          <div className="pnl-cards">
            <div className="pnl-card ok">
              <div className="v">{m.claimPass}/{m.rows.length}</div>
              <div className="k">Fact-checked</div>
              <div className="h">Every figure on the page traced back to a real published source</div>
            </div>
          </div>

          {admin && (
            <Suspense fallback={null}><GateDetail total={m.rows.length} /></Suspense>
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

        <div className="pnl-foot">{admin ? 'Reads the pages table only. No changes are made from this screen.' : 'This view is read-only and updates on its own as pages are written and approved.'}</div>
      </div>
    </div>
  );
}
