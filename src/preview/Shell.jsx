// Shared identity for every client-facing surface: /, /collection, /panel.
// One header, one motif, one footer — so the three read as one product.
// The engine at /content_admin is deliberately absent from this file.

export const RFP_URL = 'https://noladmc.com/request-for-a-proposal/';

export const CLIENT_NAV = [
  { key: 'overview', label: 'Overview', href: '/' },
  { key: 'collection', label: 'The Collection', href: '/collection' },
  { key: 'panel', label: 'Control Panel', href: '/panel' }
];

/**
 * The signature: an abstracted French Quarter wrought-iron rule. Scrollwork
 * curls taper from a stylised fleur-de-lis, drawn as thin brass strokes — the
 * only New Orleans signal, and the only place any boldness is spent.
 */
export function IronRule({ tight = false }) {
  return (
    <div className={`pv-iron${tight ? ' tight' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 340 34" fill="none" stroke="currentColor" strokeWidth="1.1"
           strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 17h96" opacity=".45" />
        <path d="M100 17c12 0 12-9 22-9s10 9 0 9-10-9-22-9" opacity=".8" />
        <path d="M240 17c-12 0-12-9-22-9s-10 9 0 9 10-9 22-9" opacity=".8" />
        <path d="M240 17h96" opacity=".45" />
        <path d="M170 4c-4 6-4 9 0 13 4-4 4-7 0-13z" />
        <path d="M170 17c-7-2-11 1-11 5s4 6 11 4c7 2 11-1 11-4s-4-7-11-5z" />
        <path d="M170 17v13" />
        <path d="M163 30h14" opacity=".7" />
      </svg>
    </div>
  );
}

export function SiteHeader({ active, onLogoClick }) {
  return (
    <header className="pv-head">
      <a href="/" onClick={onLogoClick} aria-label="Overview">
        <img className="pv-logo" src="/brand/noladmc-logo.png" alt="NOLA DMC" />
      </a>
      <nav className="pv-nav">
        {CLIENT_NAV.map((n) => (
          <a key={n.key} href={n.href} className={active === n.key ? 'on' : ''}>{n.label}</a>
        ))}
      </nav>
      <a className="pv-cta" href={RFP_URL} target="_blank" rel="noreferrer">Request a Proposal</a>
    </header>
  );
}

export function EndCta({ line = 'Ready to talk about your programme?' }) {
  return (
    <div className="pv-endcta">
      <p>{line}</p>
      <a className="pv-cta" href={RFP_URL} target="_blank" rel="noreferrer">Request a Proposal</a>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="pv-foot">
      <span>NOLA DMC — Locally Woman Owned &amp; Operated</span>
      <span>Private preview — prepared for review</span>
    </footer>
  );
}
