import { useMemo, useState } from 'react';

export default function ProviderList({ providers, facetCounts, selected, onSelect }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [category, setCategory] = useState('all');

  const statuses = useMemo(
    () => [...new Set(providers.map((p) => p.status))].sort(),
    [providers]
  );

  const categories = useMemo(() => {
    const c = new Map();
    for (const p of providers) for (const x of p.categories || []) c.set(x, (c.get(x) || 0) + 1);
    // long tail of one-off model-generated categories would swamp the chip row
    return [...c.entries()].filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [providers]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return providers
      .filter((p) => (status === 'all' ? true : p.status === status))
      .filter((p) => (category === 'all' ? true : (p.categories || []).includes(category)))
      .filter((p) => (!needle ? true : p.name.toLowerCase().includes(needle)))
      .sort((a, b) => (facetCounts[b.id] || 0) - (facetCounts[a.id] || 0) || a.name.localeCompare(b.name));
  }, [providers, q, status, category, facetCounts]);

  return (
    <div className="left">
      <div className="left-tools">
        <input
          type="text"
          placeholder="Search provider name…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="chips">
          <button className={`chip ${status === 'all' ? 'on' : ''}`} onClick={() => setStatus('all')}>all</button>
          {statuses.map((s) => (
            <button key={s} className={`chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
        {categories.length > 0 && (
          <div className="chips">
            <button className={`chip ${category === 'all' ? 'on' : ''}`} onClick={() => setCategory('all')}>
              any category
            </button>
            {categories.map((c) => (
              <button key={c} className={`chip ${category === c ? 'on' : ''}`} onClick={() => setCategory(c)}>
                {c.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        )}
        <div className="count">{rows.length} of {providers.length} providers · sorted by facet count</div>
      </div>

      <div className="list">
        {rows.map((p) => (
          <div
            key={p.id}
            className={`row ${selected?.id === p.id ? 'sel' : ''}`}
            onClick={() => onSelect(p)}
            title={p.name}
          >
            <span className={`dot ${p.status}`} title={p.status} />
            <span className="row-name">{p.name}</span>
            {p.city && p.city !== 'New Orleans' && <span className="row-sub">{p.city}</span>}
            <span className="row-n">{facetCounts[p.id] || 0}</span>
          </div>
        ))}
        {rows.length === 0 && <div className="empty">No providers match.</div>}
      </div>
    </div>
  );
}
