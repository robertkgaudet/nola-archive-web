import { useMemo } from 'react';
import { FACET_LABELS, orderOf } from '../constants.js';

function Facet({ f }) {
  return (
    <div className="facet">
      <div className="facet-top">
        <span className={`badge ${f.confidence}`}>{f.confidence}</span>
        <span className="label mono">{f.label}</span>
        {f.value_numeric != null && (
          <span className="num">{f.value_numeric}{f.unit ? ` ${f.unit}` : ''}</span>
        )}
      </div>
      <div className="value">{f.value}</div>
      {f.sources?.url && (
        <div className="src">
          <a href={f.sources.url} target="_blank" rel="noreferrer">{f.sources.url}</a>
        </div>
      )}
    </div>
  );
}

export default function ProviderDetail({ provider, facets, services }) {
  const groups = useMemo(() => {
    const g = new Map();
    for (const f of facets) {
      if (!g.has(f.facet_type)) g.set(f.facet_type, []);
      g.get(f.facet_type).push(f);
    }
    for (const list of g.values()) {
      list.sort((a, b) => a.label.localeCompare(b.label));
    }
    return [...g.entries()].sort((a, b) => orderOf(a[0]) - orderOf(b[0]));
  }, [facets]);

  if (!provider) {
    return <div className="main"><div className="empty">Select a provider to view its facts.</div></div>;
  }

  return (
    <div className="main">
      <div className="p-head">
        <div className="p-name">{provider.name}</div>
        <div className="p-meta">
          <span className={`dot ${provider.status}`} /> <span>{provider.status.replace('_', ' ')}</span>
          {provider.city && <span>· {provider.city}</span>}
          {provider.website && (
            <span>· <a href={provider.website} target="_blank" rel="noreferrer">{provider.website}</a></span>
          )}
          <span>· {facets.length} facets</span>
          <span>· {services.length} services</span>
        </div>
        {(provider.categories || []).length > 0 && (
          <div className="p-cats">
            {provider.categories.map((c) => <span className="tag" key={c}>{c.replace(/_/g, ' ')}</span>)}
          </div>
        )}
        {provider.discovered_from && (
          <div className="p-disc">discovered via: <span className="mono">{provider.discovered_from}</span></div>
        )}
      </div>

      {services.length > 0 && (
        <div className="group">
          <div className="group-h">Services <b>{services.length}</b></div>
          {services.map((s) => (
            <div className="facet" key={s.id}>
              <div className="facet-top">
                <span className={`badge ${s.confidence}`}>{s.confidence}</span>
                <strong>{s.name}</strong>
              </div>
              {s.description && <div className="value">{s.description}</div>}
              {s.sources?.url && (
                <div className="src">
                  <a href={s.sources.url} target="_blank" rel="noreferrer">{s.sources.url}</a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {groups.map(([type, list]) => {
        const isRel = type === 'related_property';
        return (
          <div className={`group ${isRel ? 'related' : ''}`} key={type}>
            <div className="group-h">{FACET_LABELS[type] || type} <b>{list.length}</b></div>
            {isRel && (
              <div className="warn">
                These facts describe a sister or affiliated property, not {provider.name} itself.
              </div>
            )}
            <div className="facets">
              {list.map((f) => <Facet f={f} key={f.id} />)}
            </div>
          </div>
        );
      })}

      {facets.length === 0 && (
        <div className="empty">
          No facets recorded. {provider.status === 'not_found' && 'This provider could not be confirmed as operating.'}
        </div>
      )}
    </div>
  );
}
