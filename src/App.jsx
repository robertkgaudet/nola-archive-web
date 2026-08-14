import { useEffect, useMemo, useState } from 'react';
import { supabase, fetchAll, configError } from './supabase.js';
import { runCost } from './constants.js';
import { groupForProvider, reportUnmatched } from './categoryMap.js';
import Header from './components/Header.jsx';
import ProviderList from './components/ProviderList.jsx';
import ProviderDetail from './components/ProviderDetail.jsx';
import FlatView from './components/FlatView.jsx';

// View state lives in the URL hash so a refresh (or a shared link) restores
// the same provider and filters.
function readHash() {
  const p = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return {
    view: p.get('view') === 'flat' ? 'flat' : 'browse',
    providerId: p.get('p') || null,
    q: p.get('q') || '',
    status: p.get('s') || 'all',
    group: p.get('c') || 'all'
  };
}

export default function App() {
  const initial = readHash();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(configError);
  const [view, setView] = useState(initial.view);
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState(initial.q);
  const [status, setStatus] = useState(initial.status);
  const [group, setGroup] = useState(initial.group);

  useEffect(() => {
    if (configError) return;
    (async () => {
      try {
        // The whole archive is a few MB — loading it up front makes search,
        // filtering, and the flat view instant with no round trips.
        const [providers, facets, services, runs] = await Promise.all([
          fetchAll('providers', 'id, name, slug, website, city, categories, status, discovered_from'),
          fetchAll('facets', 'id, provider_id, facet_type, label, value, value_numeric, unit, confidence, sources(url)'),
          fetchAll('services', 'id, provider_id, name, description, confidence, sources(url)'),
          fetchAll('research_runs', 'input_tokens, output_tokens, cache_read_tokens, searches_used')
        ]);
        const { count: sourceCount } = await supabase
          .from('sources').select('id', { count: 'exact', head: false }).limit(1);
        setData({ providers, facets, services, runs, sourceCount: sourceCount ?? 0 });
        // restore a provider from the hash once the data exists
        const want = readHash().providerId;
        if (want) setSelected(providers.find((p) => p.id === want) || null);
      } catch (e) {
        setErr(e.message);
      }
    })();
  }, []);

  // keep the hash in sync with view state
  useEffect(() => {
    if (!data) return;
    const p = new URLSearchParams();
    if (view !== 'browse') p.set('view', view);
    if (selected) p.set('p', selected.id);
    if (q) p.set('q', q);
    if (status !== 'all') p.set('s', status);
    if (group !== 'all') p.set('c', group);
    const next = p.toString();
    const target = next ? `#${next}` : '';
    if (window.location.hash !== target) {
      window.history.replaceState(null, '', `${window.location.pathname}${target}`);
    }
  }, [data, view, selected, q, status, group]);

  const providerById = useMemo(
    () => Object.fromEntries((data?.providers || []).map((p) => [p.id, p])),
    [data]
  );

  // provider id -> display group, computed once
  const groupOf = useMemo(() => {
    if (!data) return {};
    const m = {};
    for (const p of data.providers) m[p.id] = groupForProvider(p);
    reportUnmatched();
    return m;
  }, [data]);

  const facetsByProvider = useMemo(() => {
    const m = {};
    for (const f of data?.facets || []) (m[f.provider_id] ||= []).push(f);
    return m;
  }, [data]);

  const servicesByProvider = useMemo(() => {
    const m = {};
    for (const s of data?.services || []) (m[s.provider_id] ||= []).push(s);
    return m;
  }, [data]);

  const facetCounts = useMemo(() => {
    const m = {};
    for (const f of data?.facets || []) m[f.provider_id] = (m[f.provider_id] || 0) + 1;
    return m;
  }, [data]);

  const stats = useMemo(() => {
    if (!data) return null;
    const byStatus = {};
    for (const p of data.providers) byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    return {
      providers: data.providers.length,
      byStatus,
      facets: data.facets.length,
      services: data.services.length,
      sources: data.sourceCount,
      spend: data.runs.reduce((a, r) => a + runCost(r), 0)
    };
  }, [data]);

  if (err) {
    return (
      <div className="err">
        <h2>Cannot load the archive</h2>
        <div>{err}</div>
        <div style={{ marginTop: 10 }}>
          If this mentions <b>permission denied</b> or returns zero rows, the read-only RLS
          policies have not been applied yet. If it mentions a missing key, create a{' '}
          <b>.env</b> file with:
        </div>
        <code>VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co{'\n'}VITE_SUPABASE_ANON_KEY=your-publishable-anon-key</code>
      </div>
    );
  }

  if (!data) return <div className="empty" style={{ paddingTop: 80 }}>Loading archive…</div>;

  const openProvider = (id) => {
    setSelected(providerById[id]);
    setView('browse');
  };

  return (
    <div className="app">
      <Header stats={stats} view={view} setView={setView} />
      {view === 'browse' ? (
        <div className="body">
          <ProviderList
            providers={data.providers}
            facetCounts={facetCounts}
            groupOf={groupOf}
            selected={selected}
            onSelect={setSelected}
            q={q} setQ={setQ}
            status={status} setStatus={setStatus}
            group={group} setGroup={setGroup}
          />
          <ProviderDetail
            provider={selected}
            facets={selected ? facetsByProvider[selected.id] || [] : []}
            services={selected ? servicesByProvider[selected.id] || [] : []}
          />
        </div>
      ) : (
        <div className="body">
          <FlatView
            facets={data.facets}
            providerById={providerById}
            groupOf={groupOf}
            onOpen={openProvider}
          />
        </div>
      )}
    </div>
  );
}
