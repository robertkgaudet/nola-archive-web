import React from 'react';
import { createRoot } from 'react-dom/client';

// Four surfaces, one bundle, chosen by path. Each owns its CSS and sets
// data-surface on <body>, and each is a dynamic import — so a surface's code
// never ships inside another's chunk.
//
//   /                     client landing — how this works, generically
//   /collection           the answer collection, editorial reading view
//   /panel                control panel, client framing
//   /content_admin        the internal archive browser (Rob only, unlinked)
//   /content_admin/panel  the control panel with all gate detail (Rob only)
//
// No client surface links to /content_admin, and the archive's code is not
// present in any client chunk.
const path = window.location.pathname.replace(/\/+$/, '') || '/';

async function boot() {
  const root = createRoot(document.getElementById('root'));
  let View, props = {};

  if (path === '/collection') {
    document.body.dataset.surface = 'preview';
    document.title = 'The Answer Collection — NOLA DMC';
    View = (await import('./preview/Preview.jsx')).default;
  } else if (path === '/panel') {
    document.body.dataset.surface = 'panel';
    document.title = 'Content Control Panel — NOLA DMC';
    View = (await import('./panel/Panel.jsx')).default;
    props = { mode: 'client' };
  } else if (path === '/content_admin/panel') {
    document.body.dataset.surface = 'panel';
    document.title = 'Control Panel — full detail';
    View = (await import('./panel/Panel.jsx')).default;
    props = { mode: 'admin' };
  } else if (path === '/content_admin') {
    document.body.dataset.surface = 'archive';
    document.title = 'NOLA Archive';
    await import('./styles.css');
    View = (await import('./App.jsx')).default;
  } else {
    document.body.dataset.surface = 'preview';
    document.title = 'Answer Engine Optimisation — NOLA DMC';
    View = (await import('./preview/Landing.jsx')).default;
  }

  root.render(<React.StrictMode><View {...props} /></React.StrictMode>);
}

boot();
