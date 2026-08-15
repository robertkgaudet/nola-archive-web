import React from 'react';
import { createRoot } from 'react-dom/client';

// Three surfaces, one bundle, chosen by path. Each owns its own CSS and sets
// data-surface on <body> so stylesheets cannot bleed between them, and each is
// a dynamic import so a surface's code never ships inside another's chunk.
//
//   /          internal archive browser — Rob's workbench, unchanged.
//              This is its original address and it keeps it.
//   /preview   client preview — Meg's editorial site. No tooling, no metrics.
//   /panel     content control panel — Rob's page metrics.
//
// Neither client surface links to the internal browser.
const path = window.location.pathname.replace(/\/+$/, '') || '/';

async function boot() {
  const root = createRoot(document.getElementById('root'));
  let View;

  if (path === '/preview') {
    document.body.dataset.surface = 'preview';
    document.title = 'NOLA DMC — Answer Collection';
    View = (await import('./preview/Preview.jsx')).default;
  } else if (path === '/panel') {
    document.body.dataset.surface = 'panel';
    document.title = 'Content Control Panel';
    View = (await import('./panel/Panel.jsx')).default;
  } else {
    document.body.dataset.surface = 'archive';
    document.title = 'NOLA Archive';
    await import('./styles.css');
    View = (await import('./App.jsx')).default;
  }

  root.render(<React.StrictMode><View /></React.StrictMode>);
}

boot();
