// Three custom line marks, drawn by the same hand as the wrought-iron rule:
// single stroke, no fill, 1.1 weight, round caps and joins, currentColor so
// each takes its context's accent. Markers, not decoration — one per context.

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.1,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false
};

/** Fleur-de-lis — the collection's recurring mark. */
export function FleurDeLis({ className = 'pv-ico' }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 2.6c-2.1 3.3-2.1 5.6 0 7.9 2.1-2.3 2.1-4.6 0-7.9z" />
      <path d="M12 10.8c-3.9-1.6-6.9.7-6.9 3.3 0 2.1 2.3 3.3 6.9 2.1" />
      <path d="M12 10.8c3.9-1.6 6.9.7 6.9 3.3 0 2.1-2.3 3.3-6.9 2.1" />
      <path d="M12 10.8v9.6" />
      <path d="M8.7 17.1h6.6" />
    </svg>
  );
}

/** Gas lamp — the French Quarter street lamp. */
export function GasLamp({ className = 'pv-ico' }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 2v1.6" />
      <path d="M8.9 5.6 10.4 3.6h3.2l1.5 2z" />
      <path d="M8.9 5.6 7.8 13.2h8.4L15.1 5.6" />
      <path d="M12 7.9c-.9 1.3-.9 2.2 0 3 .9-.8.9-1.7 0-3z" />
      <path d="M12 13.2v7.2" />
      <path d="M9.6 20.4h4.8" />
    </svg>
  );
}

/** Streetcar — side elevation, trolley pole up. */
export function Streetcar({ className = 'pv-ico' }) {
  return (
    <svg {...base} className={className}>
      <path d="M4.2 8.2h15.6" />
      <path d="M5.4 8.2v7.9h13.2V8.2" />
      <path d="M7.9 10.6h3.1v3H7.9zM13 10.6h3.1v3H13z" />
      <path d="M5.4 16.1h13.2" />
      <circle cx="8.6" cy="18.4" r="1.3" />
      <circle cx="15.4" cy="18.4" r="1.3" />
      <path d="M14.6 8.2 18.4 3.4" />
    </svg>
  );
}

// Purposeful mapping — a theme always gets the same mark.
const BY_THEME = {
  'Parades & Permits': FleurDeLis,
  'Special Events': FleurDeLis,
  'Excursions': Streetcar,
  'Transportation': Streetcar,
  'Entertainment': GasLamp,
  'Team Building/CSR': GasLamp
};

export function ThemeIcon({ theme, className }) {
  const Ico = BY_THEME[theme] || FleurDeLis;
  return <Ico className={className} />;
}
