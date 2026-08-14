import { useMemo, useState } from 'react';

// Minimal markdown renderer — headings, bold, italics, links, lists, paragraphs.
// Deliberately not a dependency: the generator emits a known, narrow subset.
function renderMd(md) {
  if (!md) return [];
  const blocks = [];
  const lines = md.replace(/\r/g, '').split('\n');
  let para = [];
  let list = [];

  const inline = (t) => t
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  const flushPara = () => {
    if (!para.length) return;
    blocks.push({ type: 'p', html: inline(para.join(' ')) });
    para = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push({ type: 'ul', items: list.map(inline) });
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); flushList(); continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flushPara(); flushList(); blocks.push({ type: 'h', level: h[1].length, html: inline(h[2]) }); continue; }

    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) { flushPara(); list.push(li[1]); continue; }

    flushList();
    para.push(line.trim());
  }
  flushPara(); flushList();
  return blocks;
}

function Rendered({ md }) {
  const blocks = useMemo(() => renderMd(md), [md]);
  return (
    <div className="page-body">
      {blocks.map((b, i) => {
        if (b.type === 'h') {
          const Tag = `h${Math.min(b.level + 1, 6)}`;
          return <Tag key={i} dangerouslySetInnerHTML={{ __html: b.html }} />;
        }
        if (b.type === 'ul') {
          return <ul key={i}>{b.items.map((x, j) => <li key={j} dangerouslySetInnerHTML={{ __html: x }} />)}</ul>;
        }
        return <p key={i} dangerouslySetInnerHTML={{ __html: b.html }} />;
      })}
    </div>
  );
}

export default function Pages({ pages, facets, providerById, onOpenProvider }) {
  const [selected, setSelected] = useState(null);
  const [showClaims, setShowClaims] = useState(false);

  const facetById = useMemo(() => new Map(facets.map((f) => [f.id, f])), [facets]);
  const current = selected ? pages.find((p) => p.id === selected) : null;

  if (!pages.length) {
    return (
      <div className="main">
        <div className="empty">
          No generated pages yet.<br />
          Run <span className="mono">npm run pages:sample</span> in the pipeline repo, and make sure
          <span className="mono"> 005-pages.sql</span> and the anon read policy for
          <span className="mono"> pages</span> have been applied.
        </div>
      </div>
    );
  }

  const gateClass = (s) => (s === 'clean' || s === 'pass' ? 'high' : s === 'not_run' ? 'medium' : 'low');

  return (
    <div className="body">
      <div className="left">
        <div className="left-tools">
          <div className="tool-row chips">
            <span className="count">{pages.length} generated pages</span>
          </div>
        </div>
        <div className="list">
          {pages.map((p) => (
            <div
              key={p.id}
              className={`row ${selected === p.id ? 'sel' : ''}`}
              onClick={() => setSelected(p.id)}
              title={p.title}
            >
              <span className={`dot ${p.status === 'draft' ? 'pending' : 'complete'}`} />
              <span className="row-name">{p.title}</span>
              <span className={`badge ${gateClass(p.shield_status)}`}>{p.shield_status}</span>
              <span className={`badge ${gateClass(p.claim_audit_status)}`}>{p.claim_audit_status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="main">
        {!current && <div className="empty">Select a page to read it as it would appear on-site.</div>}
        {current && (
          <>
            <div className="p-head">
              <div className="p-meta" style={{ marginBottom: 8 }}>
                <span className="tag">{current.status}</span>
                <span className={`badge ${gateClass(current.shield_status)}`}>shield: {current.shield_status}</span>
                <span className={`badge ${gateClass(current.claim_audit_status)}`}>claims: {current.claim_audit_status}</span>
                <span className="mono" style={{ color: 'var(--fg-faint)' }}>{current.slug}</span>
                <button className="chip" onClick={() => setShowClaims((s) => !s)}>
                  {showClaims ? 'hide evidence' : 'show evidence'}
                </button>
              </div>
            </div>

            {/* rendered as it would read on-site */}
            <article className="page-render">
              <h1>{current.title}</h1>
              {current.direct_answer && <p className="dek">{current.direct_answer}</p>}
              <Rendered md={current.body_md} />

              {(current.faq || []).length > 0 && (
                <>
                  <h2>Frequently asked</h2>
                  {(current.faq || []).map((f, i) => (
                    <div className="faq-item" key={i}>
                      <div className="faq-q">{f.q}</div>
                      <div className="faq-a">{f.a}</div>
                    </div>
                  ))}
                </>
              )}

              {(current.related_slugs || []).length > 0 && (
                <p className="related">
                  Related: {(current.related_slugs || []).map((s, i) => (
                    <span key={s}>{i > 0 && ' · '}<span className="mono">{s}</span></span>
                  ))}
                </p>
              )}
              {current.meta_description && (
                <p className="metadesc"><b>meta</b> {current.meta_description}</p>
              )}
            </article>

            {showClaims && (
              <div className="group">
                <div className="group-h">
                  Claim map — every claim and the facets that evidence it
                  <b>{(current.claim_map || []).length}</b>
                </div>
                {(current.claim_map || []).map((c, i) => (
                  <div className="facet" key={i}>
                    <div className="value"><strong>{c.claim}</strong></div>
                    {(c.facet_ids || []).length === 0 && (
                      <div className="src" style={{ color: 'var(--lo)' }}>no evidence cited</div>
                    )}
                    {(c.facet_ids || []).map((fid) => {
                      const f = facetById.get(fid);
                      if (!f) return <div className="src" key={fid} style={{ color: 'var(--lo)' }}>unresolved facet {fid}</div>;
                      return (
                        <div className="src" key={fid} style={{ marginTop: 4 }}>
                          <span className={`badge ${f.confidence}`} style={{ marginRight: 6 }}>{f.confidence}</span>
                          <span className="mono" style={{ color: 'var(--fg-faint)' }}>{f.facet_type}</span>{' '}
                          {f.value}{' '}
                          <a href="#" onClick={(e) => { e.preventDefault(); onOpenProvider(f.provider_id); }}>
                            {providerById[f.provider_id]?.name || 'provider'}
                          </a>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            {(current.shield_hits || []).length > 0 && (
              <div className="group">
                <div className="group-h" style={{ color: 'var(--lo)' }}>Shield hits <b>{current.shield_hits.length}</b></div>
                {current.shield_hits.map((h, i) => (
                  <div className="facet" key={i}>
                    <div className="value"><span className="mono">[{h.field}]</span> {h.name} — {h.match}</div>
                  </div>
                ))}
              </div>
            )}

            {(current.claim_audit_issues || []).length > 0 && (
              <div className="group">
                <div className="group-h" style={{ color: 'var(--lo)' }}>Claim audit issues <b>{current.claim_audit_issues.length}</b></div>
                {current.claim_audit_issues.map((x, i) => (
                  <div className="facet" key={i}>
                    <div className="value">{x.problem}{x.id ? ` (${x.id})` : ''}</div>
                    <div className="src">{x.claim}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
