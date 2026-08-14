import { useMemo } from 'react';
import { GROUPS, mapCategory } from '../categoryMap.js';
import Refine from './Refine.jsx';

// Name plus raw tags, underscores flattened to spaces so "photo booth" finds
// providers tagged photo_booth even though no provider is named that.
const haystack = (p) =>
  `${p.name} ${(p.categories || []).join(' ').replace(/_/g, ' ')}`.toLowerCase();

export default function ProviderList({
  providers, facetCounts, groupOf, selected, onSelect,
  q, setQ, status, setStatus, group, setGroup, tags, setTags
}) {
  const statuses = useMemo(
    () => [...new Set(providers.map((p) => p.status))].sort(),
    [providers]
  );

  // base = everything except the pill filter, so pill counts show what adding
  // one would actually yield
  const base = useMemo(
    () => providers
      .filter((p) => (status === 'all' ? true : p.status === status))
      .filter((p) => (group === 'all' ? true : (groupOf[p.id] || 'Other') === group)),
    [providers, status, group, groupOf]
  );

  const groupCounts = useMemo(() => {
    const withStatus = providers.filter((p) => (status === 'all' ? true : p.status === status));
    const m = {};
    for (const p of withStatus) m[groupOf[p.id] || 'Other'] = (m[groupOf[p.id] || 'Other'] || 0) + 1;
    return { m, total: withStatus.length };
  }, [providers, status, groupOf]);

  const tagList = useMemo(() => {
    const m = new Map();
    for (const p of base) {
      for (const c of p.categories || []) {
        // when a group is selected, only that group's own tags are relevant
        if (group !== 'all' && mapCategory(c) !== group) continue;
        m.set(c, (m.get(c) || 0) + 1);
      }
    }
    return [...m.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [base, group]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return base
      .filter((p) => (tags.length === 0 ? true : (p.categories || []).some((c) => tags.includes(c))))
      .filter((p) => (!needle ? true : haystack(p).includes(needle)))
      .sort((a, b) => (facetCounts[b.id] || 0) - (facetCounts[a.id] || 0) || a.name.localeCompare(b.name));
  }, [base, q, tags, facetCounts]);

  const toggleTag = (t) =>
    setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);

  return (
    <div className="left">
      <div className="left-tools">
        <div className="tool-row">
          <select
            className="cat-select"
            value={group}
            onChange={(e) => { setGroup(e.target.value); setTags([]); }}
          >
            <option value="all">All categories ({groupCounts.total})</option>
            {GROUPS.filter((g) => groupCounts.m[g]).map((g) => (
              <option key={g} value={g}>{g} ({groupCounts.m[g]})</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search name or tag…"
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

        <Refine
          tags={tagList}
          selected={tags}
          onToggle={toggleTag}
          onClear={() => setTags([])}
          scoped={group !== 'all'}
        />
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
