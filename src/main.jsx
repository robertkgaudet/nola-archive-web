import React from 'react';
import { createRoot } from 'react-dom/client';

// Three surfaces, one bundle, chosen by path:
//   /         client preview  — editorial, no metrics, no tooling
//   /panel    control panel   — Rob only, metrics over the same pages
//   /archive  archive browser — the internal workbench, linked from neither
//
// Each surface owns its own CSS and sets data-surface on <body>, so the
// stylesheets cannot bleed into one another.
const path = window.location.pathname.replace(/\/+$/, '') || '/';

async function boot() {
  const root = createRoot(document.getElementById('root'));
  let View;

  if (path === '/panel') {
    document.body.dataset.surface = 'panel';
    document.title = 'Control Panel';
    View = (await import('./panel/Panel.jsx')).default;
  } else if (path === '/archive') {
    document.body.dataset.surface = 'archive';
    document.title = 'NOLA Archive';
    await import('./styles.css');
    View = (await import('./App.jsx')).default;
  } else {
    document.body.dataset.surface = 'preview';
    document.title = 'NOLA DMC — Answer Collection';
    View = (await import('./preview/Preview.jsx')).default;
  }

  root.render(<React.StrictMode><View /></React.StrictMode>);
}

boot();
