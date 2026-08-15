import { useEffect, useMemo, useState } from 'react';
import { supabase, fetchAll, configError } from '../supabase.js';
import { THEMES, THEME_BLURB, themeFor } from '../themeMap.js';
import './preview.css';

/**
 * The signature: an abstracted French Quarter wrought-iron rule. Scrollwork
 * curls taper out from a stylised fleur-de-lis. Drawn as thin brass strokes —
 * the only New Orleans signal on the page, and deliberately the only place
 * any boldness is spent.
 */
function IronRule({ tight = false }) {
  return (
    <div className={`pv-iron${tight ? ' tight' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 340 34" fill="none" stroke="currentColor" strokeWidth="1.1"
           strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 17h96" opacity=".45" />
        <path d="M100 17c12 0 12-9 22-9s10 9 0 9-10-9-22-9" opacity=".8" />
        <path d="M240 17c-12 0-12-9-22-9s-10 9 0 9 10-9 22-9" opacity=".8" />
        <path d="M240 17h96" opacity=".45" />
        <path d="M170 4c-4 6-4 9 0 13 4-4 4-7 0-13z" />
        <path d="M170 17c-7-2-11 1-11 5s4 6 11 4c7 2 11-1 11-4s-4-7-11-5z" />
        <path d="M170 17v13" />
        <path d="M163 30h14" opacity=".7" />
      </svg>
    </div>
  );
}

/** Fade-up on entry; disabled outright under prefers-reduced-motion. */
function useReveal(dep) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.querySelectorAll('.reveal').forEach((n) => n.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.reveal:not(.in)').forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [dep]);
}

// Same narrow markdown subset the generator emits.
function renderMd(md) {
  if (!md) return [];
  const out = []; let para = [], list = [];
  const inline = (t) => t
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  const flushP = () => { if (para.length) { out.push({ t: 'p', h: inline(para.join(' ')) }); para = []; } };
  const flushL = () => { if (list.length) { out.push({ t: 'ul', items: list.map(inline) }); list = []; } };
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushP(); flushL(); continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flushP(); flushL(); out.push({ t: 'h', lvl: h[1].length, h: inline(h[2]) }); continue; }
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) { flushP(); list.push(li[1]); continue; }
    flushL(); para.push(line.trim());
  }
  flushP(); flushL();
  return out;
}

// Her real Request for a Proposal fields, mirrored exactly — but wired to
// nothing. Submitting shows a preview confirmation and sends no data anywhere.
const SERVICES = [
  'Top of the Line Transportation', 'Event Design & Decor', 'Parade & Permits',
  'Excursions', 'Team Building & CSR', 'Entertainment'
];

function RfpModal({ onClose }) {
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div className="pv-modal-bg" onClick={onClose}>
      <div className="pv-modal" onClick={(e) => e.stopPropagation()}>
        <button className="pv-close" onClick={onClose} aria-label="Close">×</button>

        {sent ? (
          <div className="pv-sent">
            <div className="pv-sent-mark">✓</div>
            <h3>This is where your enquiry would go</h3>
            <p>Nothing was sent — this is a preview of the form only.</p>
            <p>On the live site this arrives with your team straight away, and we follow up personally.</p>
            <button className="pv-cta" style={{ marginTop: 18 }} onClick={onClose}>Close preview</button>
          </div>
        ) : (
          <>
            <h2>Request for a Proposal</h2>
            <p className="pv-sub">Tell us about your programme and we will design it around you.</p>
            <p className="pv-preview-note">
              This is a preview of how the form will look and feel — the live version sends
              straight to your team.
            </p>

            <form onSubmit={(e) => { e.preventDefault(); setSent(true); }}>
              <div className="pv-two">
                <div className="pv-field">
                  <label>Company Name <span aria-hidden>*</span></label>
                  <input type="text" required />
                </div>
                <div className="pv-field">
                  <label>Name <span aria-hidden>*</span></label>
                  <input type="text" required />
                </div>
              </div>
              <div className="pv-two">
                <div className="pv-field">
                  <label>Phone No. <span aria-hidden>*</span></label>
                  <input type="tel" required />
                </div>
                <div className="pv-field">
                  <label>Email Address <span aria-hidden>*</span></label>
                  <input type="email" required />
                </div>
              </div>

              <div className="pv-field">
                <label>What are you interested in?</label>
                <div className="pv-checks">
                  {SERVICES.map((s) => (
                    <label className="pv-check" key={s}>
                      <input type="checkbox" /> {s}
                    </label>
                  ))}
                </div>
              </div>

              <div className="pv-two">
                <div className="pv-field">
                  <label>Event Dates <span aria-hidden>*</span></label>
                  <input type="text" placeholder="e.g. 12–15 March 2027" required />
                </div>
                <div className="pv-field">
                  <label>Hotel <span aria-hidden>*</span></label>
                  <input type="text" required />
                </div>
              </div>

              <div className="pv-field">
                <label>Number of Attendees <span aria-hidden>*</span></label>
                <input type="text" required />
              </div>

              <div className="pv-field">
                <label>Message <span aria-hidden>*</span></label>
                <textarea required />
              </div>

              <div className="pv-field">
                <label>Upload Your Files Here</label>
                <div className="pv-file">Drag a file here, or click to browse</div>
              </div>

              <button className="pv-cta" type="submit" style={{ width: '100%', padding: 14 }}>
                Send my request
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function Article({ page, all, theme, onOpen, onBack, onRfp }) {
  const [openFaq, setOpenFaq] = useState(0);
  const blocks = useMemo(() => renderMd((page.body_md || '').replace('{{CTA_RFP}}', '')), [page]);
  useReveal(page.slug);
  const related = (page.related_slugs || [])
    .map((s) => all.find((p) => p.slug === s)).filter(Boolean).slice(0, 3);

  useEffect(() => { window.scrollTo(0, 0); setOpenFaq(0); }, [page.slug]);

  return (
    <div className="pv-wrap">
      <article className="pv-article">
        <button className="pv-back" onClick={onBack}>← The collection</button>
        {theme && <div className="pv-eyebrow">{theme}</div>}
        <h1>{page.title}</h1>
        {page.direct_answer && <p className="pv-dek">{page.direct_answer}</p>}

        <div className="pv-body">
          {blocks.map((b, i) => {
            if (b.t === 'h') { const T = `h${Math.min(b.lvl + 1, 4)}`; return <T key={i} dangerouslySetInnerHTML={{ __html: b.h }} />; }
            if (b.t === 'ul') return <ul key={i}>{b.items.map((x, j) => <li key={j} dangerouslySetInnerHTML={{ __html: x }} />)}</ul>;
            return <p key={i} dangerouslySetInnerHTML={{ __html: b.h }} />;
          })}
        </div>

        {(page.faq || []).length > 0 && (
          <div className="pv-faq">
            <IronRule tight />
            <h2>Questions we are asked</h2>
            <div className="pv-acc">
              {(page.faq || []).map((f, i) => (
                <div className={`pv-acc-item${openFaq === i ? ' open' : ''}`} key={i}>
                  <button
                    className="pv-acc-q"
                    aria-expanded={openFaq === i}
                    onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                  >
                    {f.q}
                  </button>
                  <div className="pv-acc-a"><p>{f.a}</p></div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pv-endcta">
          <p>Ready to talk about your programme?</p>
          <button className="pv-cta" onClick={onRfp}>Request a Proposal</button>
        </div>

        {related.length > 0 && (
          <div className="pv-related">
            <div className="pv-related-h">Explore next</div>
            {related.map((r) => (
              <button key={r.slug} onClick={() => onOpen(r)}>{r.title}</button>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}

export default function Preview() {
  const [pages, setPages] = useState(null);
  const [err, setErr] = useState(configError);
  const [open, setOpen] = useState(null);
  const [rfp, setRfp] = useState(false);

  useEffect(() => {
    if (configError) return;
    (async () => {
      try {
        const rows = await fetchAll('pages', 'slug, title, direct_answer, body_md, faq, related_slugs, meta_description');
        const sorted = rows.sort((a, b) => a.title.localeCompare(b.title));
        setPages(sorted);
        // deep link: /?p=<slug> opens that article directly
        const want = new URLSearchParams(window.location.search).get('p');
        if (want) setOpen(sorted.find((r) => r.slug === want) || null);
      } catch (e) { setErr(e.message); }
    })();
  }, []);

  useReveal(open ? open.slug : 'index');

  const byTheme = useMemo(() => {
    const m = new Map(THEMES.map((t) => [t, []]));
    for (const p of pages || []) m.get(themeFor(p.slug))?.push(p);
    return m;
  }, [pages]);

  if (err) return <div className="pv"><div className="pv-wrap" style={{ padding: 80 }}>This preview is being prepared.</div></div>;
  if (!pages) return <div className="pv"><div className="pv-wrap" style={{ padding: 80 }}>Loading…</div></div>;

  return (
    <div className="pv">
      <div className="pv-wrap">
        <header className="pv-head">
          <img className="pv-logo" src="/brand/noladmc-logo.png" alt="NOLA DMC" />
          <nav className="pv-nav">
            {THEMES.map((t) => (
              <button key={t} onClick={() => {
                setOpen(null);
                setTimeout(() => document.getElementById(t.replace(/\W+/g, '-'))?.scrollIntoView({ behavior: 'smooth' }), 30);
              }}>{t}</button>
            ))}
          </nav>
          <button className="pv-cta" onClick={() => setRfp(true)}>Request a Proposal</button>
        </header>
      </div>

      {open ? (
        <Article
          page={open}
          all={pages}
          theme={themeFor(open.slug)}
          onOpen={setOpen}
          onBack={() => setOpen(null)}
          onRfp={() => setRfp(true)}
        />
      ) : (
        <div className="pv-wrap">
          <section className="pv-hero">
            <div className="pv-kicker">The Answer Collection</div>
            <h1>Your vision. Our expertise.<br /><em>One unforgettable experience.</em></h1>
            <p className="pv-lede">
              Everything a planner needs to know about bringing a group to New Orleans —
              answered properly, in one place.
            </p>
          </section>

          <div className="pv-intro pv-narrow">
            <p>
              More and more, the planners looking for New Orleans ask an assistant first —
              <em> where can we host a rooftop reception for 150?</em>,
              <em> who can move 400 people across town?</em> — and take the answer they are given.
            </p>
            <p>
              This is a collection of <strong>{pages.length} pages</strong> that answer those
              exact questions on your own site, with the real detail planners need: capacities,
              group sizes, formats, timings. When the answer lives with you, you become the
              name that gets recommended.
            </p>
            <p>And every page ends in the same place — an invitation to Request a Proposal.</p>
          </div>

          <IronRule />

          {THEMES.map((theme, ti) => {
            const items = byTheme.get(theme) || [];
            if (!items.length) return null;
            return (
              <div key={theme}>
                {ti > 0 && <IronRule />}
                <section className="pv-theme reveal" id={theme.replace(/\W+/g, '-')}>
                  <div className="pv-theme-head">
                    <h2>{theme}</h2>
                    <span className="pv-theme-n">{String(items.length).padStart(2, '0')} {items.length === 1 ? 'story' : 'stories'}</span>
                  </div>
                  <p className="pv-theme-blurb">{THEME_BLURB[theme]}</p>
                  <div className="pv-list">
                    {items.map((p, i) => (
                      <button className="pv-row" key={p.slug} onClick={() => setOpen(p)}>
                        <span className="pv-num">{String(i + 1).padStart(2, '0')}</span>
                        <span>
                          <h3>{p.title}</h3>
                          <p>{(p.meta_description || p.direct_answer || '').slice(0, 150)}…</p>
                        </span>
                        <span className="pv-arrow" aria-hidden>→</span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            );
          })}

          <IronRule />

          <div className="pv-endcta reveal">
            <p>Ready to talk about your programme?</p>
            <a className="pv-cta" href="https://noladmc.com/request-for-a-proposal/" target="_blank" rel="noreferrer">
              Request a Proposal
            </a>
          </div>

          <footer className="pv-foot">
            <span>NOLA DMC — Locally Woman Owned &amp; Operated</span>
            <span>Preview — prepared for review</span>
          </footer>
        </div>
      )}

      {rfp && <RfpModal onClose={() => setRfp(false)} />}
    </div>
  );
}
