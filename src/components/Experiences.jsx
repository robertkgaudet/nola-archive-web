import { useMemo, useState } from 'react';

// cluster_notes is written by the pipeline as labelled blocks; parse it back
// out rather than adding columns to the experiences table.
function parseNotes(notes) {
  const out = { rank: null, thin: false, questions: [], groupSize: null, rationale: null, members: [] };
  if (!notes) return out;
  const rank = notes.match(/^RANK\s+(\d+|\?)(\s*·\s*THIN EVIDENCE)?/m);
  if (rank) { out.rank = rank[1] === '?' ? null : Number(rank[1]); out.thin = Boolean(rank[2]); }
  const q = notes.match(/PLANNER QUESTIONS:\n([\s\S]*?)(\n\n|$)/);
  if (q) out.questions = q[1].split('\n').map((l) => l.replace(/^-\s*/, '').trim()).filter(Boolean);
  const g = notes.match(/GROUP SIZE:\s*(.+)/);
  if (g) out.groupSize = g[1].trim();
  const r = notes.match(/RANKING RATIONALE:\s*([\s\S]*?)(\n\n|$)/);
  if (r) out.rationale = r[1].trim();
  const m = notes.match(/MEMBERS \(\d+\):\s*([\s\S]*?)$/);
  if (m) out.members = m[1].split(',').map((x) => x.trim()).filter(Boolean);
  return out;
}

export default function Experiences({ experiences, links, facets, providerById, onOpenProvider }) {
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState('');

  const parsed = useMemo(
    () => experiences.map((e) => ({ ...e, notes: parseNotes(e.cluster_notes) }))
      .sort((a, b) => (a.notes.rank ?? 999) - (b.notes.rank ?? 999)),
    [experiences]
  );

  // experience_facets links to FACETS; businesses are derived via provider_id
  const evidenceByExp = useMemo(() => {
    const facetById = new Map(facets.map((f) => [f.id, f]));
    const m = new Map();
    for (const l of links) {
      const f = facetById.get(l.facet_id);
      if (!f) continue;
      if (!m.has(l.experience_id)) m.set(l.experience_id, new Map());
      const byProv = m.get(l.experience_id);
      if (!byProv.has(f.provider_id)) byProv.set(f.provider_id, []);
      byProv.get(f.provider_id).push(f);
    }
    return m;
  }, [links, facets]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return parsed;
    return parsed.filter((e) =>
      e.name.toLowerCase().includes(needle) ||
      (e.description || '').toLowerCase().includes(needle) ||
      e.notes.questions.join(' ').toLowerCase().includes(needle)
    );
  }, [parsed, q]);

  const current = selected ? parsed.find((e) => e.id === selected) : null;
  const currentEvidence = current ? evidenceByExp.get(current.id) || new Map() : new Map();

  if (!experiences.length) {
    return (
      <div className="main">
        <div className="empty">
          No experience clusters yet.<br />
          Run <span className="mono">npm run cluster</span> in the pipeline repo, and make sure
          the anon read policies for <span className="mono">experiences</span> have been applied.
        </div>
      </div>
    );
  }

  return (
    <div className="body">
      <div className="left">
        <div className="left-tools">
          <div className="tool-row">
            <input
              type="text"
              placeholder="Search clusters or planner questions…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="tool-row chips">
            <span className="count">{rows.length} of {parsed.length} clusters · by rank</span>
          </div>
        </div>
        <div className="list">
          {rows.map((e) => {
            const memberCount = (evidenceByExp.get(e.id) || new Map()).size;
            return (
              <div
                key={e.id}
                className={`row ${selected === e.id ? 'sel' : ''}`}
                onClick={() => setSelected(e.id)}
                title={e.name}
              >
                <span className="rank">{e.notes.rank ?? '–'}</span>
                <span className="row-name">{e.name}</span>
                {e.notes.thin && <span className="badge low">thin</span>}
                <span className="row-n">{memberCount}</span>
              </div>
            );
          })}
          {rows.length === 0 && <div className="empty">No clusters match.</div>}
        </div>
      </div>

      <div className="main">
        {!current && <div className="empty">Select a cluster to see its evidence.</div>}
        {current && (
          <>
            <div className="p-head">
              <div className="p-name">{current.name}</div>
              <div className="p-meta">
                <span>rank {current.notes.rank ?? '–'}</span>
                <span>· {currentEvidence.size} businesses</span>
                <span>· {(links.filter((l) => l.experience_id === current.id)).length} evidencing facets</span>
                {current.notes.groupSize && <span>· {current.notes.groupSize}</span>}
                {current.notes.thin && <span className="badge low">thin evidence</span>}
              </div>
              <div className="p-disc mono">{current.slug}</div>
            </div>

            {current.description && (
              <div className="group">
                <div className="group-h">Description</div>
                <div className="value" style={{ paddingTop: 6 }}>{current.description}</div>
              </div>
            )}

            {current.notes.questions.length > 0 && (
              <div className="group">
                <div className="group-h">Planner questions this answers <b>{current.notes.questions.length}</b></div>
                {current.notes.questions.map((x, i) => (
                  <div className="facet" key={i}><div className="value">“{x}”</div></div>
                ))}
              </div>
            )}

            {current.notes.rationale && (
              <div className="group">
                <div className="group-h">Ranking rationale</div>
                <div className="value" style={{ paddingTop: 6, color: 'var(--fg-dim)' }}>
                  {current.notes.rationale}
                </div>
              </div>
            )}

            <div className="group">
              <div className="group-h">Evidencing businesses <b>{currentEvidence.size}</b></div>
              {[...currentEvidence.entries()]
                .sort((a, b) => b[1].length - a[1].length)
                .map(([providerId, fs]) => (
                  <div className="facet" key={providerId}>
                    <div className="facet-top">
                      <a href="#" onClick={(ev) => { ev.preventDefault(); onOpenProvider(providerId); }}>
                        <strong>{providerById[providerId]?.name || 'unknown business'}</strong>
                      </a>
                      <span className="label">{fs.length} facet{fs.length === 1 ? '' : 's'}</span>
                    </div>
                    {fs.map((f) => (
                      <div className="src" key={f.id} style={{ marginTop: 4 }}>
                        <span className={`badge ${f.confidence}`} style={{ marginRight: 6 }}>{f.confidence}</span>
                        <span className="mono" style={{ color: 'var(--fg-faint)' }}>{f.facet_type}</span>{' '}
                        {f.value}
                      </div>
                    ))}
                  </div>
                ))}
              {currentEvidence.size === 0 && (
                <div className="empty">
                  No evidence links resolved. If clusters exist but evidence is empty, the
                  anon read policy on <span className="mono">experience_facets</span> may be missing.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
