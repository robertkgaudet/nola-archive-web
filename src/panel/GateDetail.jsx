import { useEffect, useState } from 'react';
import { fetchAll } from '../supabase.js';

// Admin-only. Lives in its own chunk and does its own query, so nothing about
// the name check reaches the client panel's bundle — Meg's build contains no
// reference to it at all, rather than merely not rendering it.
export default function GateDetail({ total }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setRows(await fetchAll('pages', 'slug, title, shield_status, shield_hits, claim_audit_status, claim_audit_issues'));
      } catch { setRows([]); }
    })();
  }, []);

  if (!rows) return null;
  const flagged = rows.filter((r) => r.shield_status === 'flagged');
  const failed = rows.filter((r) => r.claim_audit_status !== 'pass');
  const clean = rows.length - flagged.length;

  return (
    <>
      <div className="pnl-cards" style={{ marginTop: 12 }}>
        <div className={`pnl-card ${flagged.length ? '' : 'ok'}`}>
          <div className="v">{clean}/{total}</div>
          <div className="k">Name check clean</div>
          <div className="h">No supplier named in the copy</div>
        </div>
      </div>

      {(flagged.length > 0 || failed.length > 0) && (
        <div className="pnl-issues">
          {flagged.map((r) => (
            <div className="pnl-issue" key={'s' + r.slug}>
              <div className="t"><span className="pill warn">name check</span> {r.title}</div>
              <div className="d">
                Matched: {(r.shield_hits || []).map((h) => `“${h.name}”`)
                  .filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                {' — '}review whether this is a real supplier mention or a business named
                after its own category.
              </div>
            </div>
          ))}
          {failed.map((r) => (
            <div className="pnl-issue" key={'c' + r.slug}>
              <div className="t"><span className="pill bad">facts</span> {r.title}</div>
              <div className="d">{(r.claim_audit_issues || []).map((i) => i.problem).join('; ')}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
