import { useMemo, useState } from 'react';
import { FACET_ORDER, orderOf } from '../constants.js';

const LIMIT = 2000; // keep the DOM sane; the counter tells you when it's truncating

export default function FlatView({ facets, providerById, onOpen }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [conf, setConf] = useState('all');

  const types = useMemo(() => {
    const present = new Set(facets.map((f) => f.facet_type));
    return FACET_ORDER.filter((t) => present.has(t));
  }, [facets]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return facets
      .filter((f) => (type === 'all' ? true : f.facet_type === type))
      .filter((f) => (conf === 'all' ? true : f.confidence === conf))
      .filter((f) => {
        if (!needle) return true;
        return (
          f.value?.toLowerCase().includes(needle) ||
          f.label?.toLowerCase().includes(needle) ||
          providerById[f.provider_id]?.name.toLowerCase().includes(needle)
        );
      })
      .sort(
        (a, b) =>
          orderOf(a.facet_type) - orderOf(b.facet_type) ||
          (providerById[a.provider_id]?.name || '').localeCompare(providerById[b.provider_id]?.name || '')
      );
  }, [facets, q, type, conf, providerById]);

  const shown = rows.slice(0, LIMIT);

  return (
    <div className="flat">
      <div className="flat-tools">
        <input
          type="text"
          placeholder="Search value, label, or provider…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
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
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); onOpen(f.provider_id); }}
                  >
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
