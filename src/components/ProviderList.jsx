import { useMemo } from 'react';
import { GROUPS, groupForProvider } from '../categoryMap.js';

export default function ProviderList({
  providers, facetCounts, groupOf, selected, onSelect,
  q, setQ, status, setStatus, group, setGroup
}) {
  const statuses = useMemo(
    () => [...new Set(providers.map((p) => p.status))].sort(),
    [providers]
  );

  // counts reflect the OTHER active filters, so the dropdown tells you what
  // you'd actually get rather than a global total
  const groupCounts = useMemo(() => {
    const base = providers.filter((p) => (status === 'all' ? true : p.status === status));
    const m = {};
    for (const p of base) {
      const g = groupOf[p.id] || 'Other';
      m[g] = (m[g] || 0) + 1;
    }
    return { m, total: base.length };
  }, [providers, status, groupOf]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return providers
      .filter((p) => (status === 'all' ? true : p.status === status))
      .filter((p) => (group === 'all' ? true : (groupOf[p.id] || 'Other') === group))
      .filter((p) => (!needle ? true : p.name.toLowerCase().includes(needle)))
      .sort((a, b) => (facetCounts[b.id] || 0) - (facetCounts[a.id] || 0) || a.name.localeCompare(b.name));
  }, [providers, q, status, group, facetCounts, groupOf]);

  return (
    <div className="left">
      <div className="left-tools">
        <div className="tool-row">
          <select
            className="cat-select"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="all">All categories ({groupCounts.total})</option>
            {GROUPS.filter((g) => groupCounts.m[g]).map((g) => (
              <option key={g} value={g}>{g} ({groupCounts.m[g]})</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="tool-row chips">
          <button className={`chip ${status === 'all' ? 'on' : ''}`} onClick={() => setStatus('all')}>all</button>
          {statuses.map((s) => (
            <button key={s} className={`chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>
              {s.replace('_', ' ')}
            </button>
          ))}
          <span className="count">{rows.length} shown · by facet count</span>
        </div>
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
            <span className="row-group">{groupOf[p.id] || 'Other'}</span>
            <span className="row-n">{facetCounts[p.id] || 0}</span>
          </div>
        ))}
        {rows.length === 0 && <div className="empty">No providers match.</div>}
      </div>
    </div>
  );
}
