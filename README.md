# NOLA Archive — Browser v1

Read-only UI over the NOLA Archive. One screen, three panes: a live counter
strip, a provider list, and a facts pane — plus a flat view for auditing every
facet in the archive horizontally.

The research pipeline lives in a separate repo (`nola-archive`). This repo only
reads.

## Setup

```bash
npm install
cp .env.example .env     # fill in URL + anon key
npm run dev              # http://localhost:5173
```

## Keys and safety

`VITE_SUPABASE_ANON_KEY` is the **publishable** key. It is compiled into the
browser bundle and is safe there: it grants no privileges by itself. What it can
read is entirely determined by the row-level security policies on the database.
v1 gives the `anon` role `SELECT` and nothing else, on content tables only.

**Never put `SUPABASE_SERVICE_ROLE_KEY` in this repo.** The service role bypasses
RLS completely; shipping it to a browser would hand any visitor full read/write
on the archive.

### Required database policies

The app reads nothing until the `anon` role has both table GRANTs and RLS
policies. Both are needed — a GRANT without a policy still returns zero rows,
and a policy without a GRANT fails with `42501 permission denied`. See
`sql/anon-read-policies.sql` in this repo, run in the Supabase SQL editor.

## Scripts

| command | what it does |
|---|---|
| `npm run dev` | local dev server |
| `npm run build` | production build into `dist/` |
| `npm run preview` | serve the built bundle locally |
| `npm run deploy` | build, then push `dist/` to Cloudflare Pages |

## Deploy

```bash
npx wrangler pages project create nola-archive-web --production-branch main
npm run deploy
```

Environment variables are baked in at **build** time, so after changing `.env`
you must rebuild before deploying — redeploying an old `dist/` will not pick up
the new values.

## v1 scope

- Read-only. No auth, no writes.
- Access control is an unguessable `*.pages.dev` URL plus `noindex`. That is
  obscurity, not security — anyone with the link can read the archive.
- Google sign-in is v2. At that point, tighten the `anon` policies to
  `authenticated` and the link stops being the only gate.
