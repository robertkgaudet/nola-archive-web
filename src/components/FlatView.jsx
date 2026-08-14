import { useMemo, useState } from 'react';
import { FACET_ORDER, orderOf } from '../constants.js';
import { GROUPS, mapCategory } from '../categoryMap.js';
import Refine from './Refine.jsx';

const LIMIT = 2000; // keep the DOM sane; the counter tells you when it's truncating

export default function FlatView({ facets, providerById, groupOf, onOpen }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [conf, setConf] = useState('all');
  const [group, setGroup] = useState('all');
  const [tags, setTags] = useState([]);

  const types = useMemo(() => {
    const present = new Set(facets.map((f) => f.facet_type));
    return FACET_ORDER.filter((t) => present.has(t));
  }, [facets]);

  const groupCounts = useMemo(() => {
    const m = {};
    for (const f of facets) {
      const g = groupOf[f.provider_id] || 'Other';
      m[g] = (m[g] || 0) + 1;
    }
    return m;
  }, [facets, groupOf]);

  // facets remaining once the group filter is applied — the basis for pill counts
  const base = useMemo(
    () => facets.filter((f) => (group === 'all' ? true : (groupOf[f.provider_id] || 'Other') === group)),
    [facets, group, groupOf]
  );

  const tagList = useMemo(() => {
    const m = new Map();
    for (const f of base) {
      for (const c of providerById[f.provider_id]?.categories || []) {
        if (group !== 'all' && mapCategory(c) !== group) continue;
        m.set(c, (m.get(c) || 0) + 1);
      }
    }
    return [...m.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [base, group, providerById]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return base
      .filter((f) => (type === 'all' ? true : f.facet_type === type))
      .filter((f) => (conf === 'all' ? true : f.confidence === conf))
      .filter((f) => {
        if (tags.length === 0) return true;
        return (providerById[f.provider_id]?.categories || []).some((c) => tags.includes(c));
      })
      .filter((f) => {
        if (!needle) return true;
        const p = providerById[f.provider_id];
        return (
          f.value?.toLowerCase().includes(needle) ||
          f.label?.toLowerCase().includes(needle) ||
          p?.name.toLowerCase().includes(needle) ||
          (p?.categories || []).join(' ').replace(/_/g, ' ').toLowerCase().includes(needle)
        );
      })
      .sort(
        (a, b) =>
          orderOf(a.facet_type) - orderOf(b.facet_type) ||
          (providerById[a.provider_id]?.name || '').localeCompare(providerById[b.provider_id]?.name || '')
      );
  }, [base, q, type, conf, tags, providerById]);

  const shown = rows.slice(0, LIMIT);
  const toggleTag = (t) => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);

  return (
    <div className="flat">
      <div className="flat-tools">
        <div className="tool-row">
          <input
            type="text"
            placeholder="Search value, label, provider, or tag…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select value={group} onChange={(e) => { setGroup(e.target.value); setTags([]); }}>
            <option value="all">all categories</option>
            {GROUPS.filter((g) => groupCounts[g]).map((g) => (
              <option key={g} value={g}>{g} ({groupCounts[g]})</option>
            ))}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">all types</option>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={conf} onChange={(e) => setConf(e.target.value)}>
            <option value="all">all confidence</option>
            <option value="high">high</option>
            <option value="medium">medium</option>
            <option value="low">low</option>
          </select>
          <div className="count">
            {rows.length.toLocaleString()} facets
            {rows.length > LIMIT && ` · showing first ${LIMIT.toLocaleString()}`}
          </div>
        </div>
        <Refine
          tags={tagList}
          selected={tags}
          onToggle={toggleTag}
          onClear={() => setTags([])}
          scoped={group !== 'all'}
        />
      </div>

      <div className="flat-scroll">
        <table>
          <thead>
            <tr>
              <th>Provider</th>
              <th>Type</th>
              <th>Conf</th>
              <th>Label</th>
              <th>Value</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((f) => (
              <tr key={f.id} className={f.facet_type === 'related_property' ? 'rel' : ''}>
                <td className="t-prov">
                  <a href="#" onClick={(e) => { e.preventDefault(); onOpen(f.provider_id); }}>
                    {providerById[f.provider_id]?.name || '—'}
                  </a>
                </td>
                <td className="t-type">{f.facet_type}</td>
                <td><span className={`badge ${f.confidence}`}>{f.confidence}</span></td>
                <td className="t-type mono">{f.label}</td>
                <td className="t-val">
                  {f.value}
                  {f.value_numeric != null && (
                    <span className="num">{f.value_numeric}{f.unit ? ` ${f.unit}` : ''}</span>
                  )}
                </td>
                <td className="t-src">
                  {f.sources?.url && (
                    <a href={f.sources.url} target="_blank" rel="noreferrer">
                      {f.sources.url.replace(/^https?:\/\/(www\.)?/, '')}
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No facets match.</div>}
      </div>
    </div>
  );
}
