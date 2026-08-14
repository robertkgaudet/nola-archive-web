import { fmt } from '../constants.js';

export default function Header({ stats, view, setView }) {
  return (
    <div className="header">
      <div className="brand">NOLA Archive <span>· v1</span></div>
      <div className="sep" />

      <div className="stat"><b>{fmt(stats.providers)}</b><i>providers</i></div>
      {Object.entries(stats.byStatus).map(([s, n]) => (
        <div className="stat" key={s}>
          <span className={`dot ${s}`} />
          <b>{fmt(n)}</b><i>{s.replace('_', ' ')}</i>
        </div>
      ))}

      <div className="sep" />
      <div className="stat"><b>{fmt(stats.facets)}</b><i>facets</i></div>
      <div className="stat"><b>{fmt(stats.services)}</b><i>services</i></div>
      <div className="stat"><b>{fmt(stats.sources)}</b><i>sources</i></div>

      {stats.experiences > 0 && (
        <div className="stat"><b>{fmt(stats.experiences)}</b><i>clusters</i></div>
      )}

      <div className="sep" />
      <div className="stat"><b>${stats.spend.toFixed(2)}</b><i>spend</i></div>

      <div className="spacer" />
      <div className="toggle">
        <button className={view === 'browse' ? 'on' : ''} onClick={() => setView('browse')}>Browse</button>
        <button className={view === 'experiences' ? 'on' : ''} onClick={() => setView('experiences')}>Experiences</button>
        <button className={view === 'flat' ? 'on' : ''} onClick={() => setView('flat')}>Flat view</button>
      </div>
    </div>
  );
}
