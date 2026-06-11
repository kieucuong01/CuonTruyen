# AI Agent Handoff

Use this file when another AI coding agent enters the repo. It is a compact
operating brief, not a full product spec.

## Start Here

Read in this order:

```text
AGENTS.md
docs/agent-playbooks/agent-token-map.md
docs/agent-playbooks/new-developer-onboarding.md
docs/agent-playbooks/current-deployment.md
docs/agent-playbooks/local-postgres-pgadmin.md
```

Then read only the subsystem file for the user's task.

## Current Source Of Truth

- Catalog and admin data are PostgreSQL-only.
- Local DB is PostgreSQL on `127.0.0.1:5432`, not Docker `55432`.
- Production DB is Supabase/Postgres configured on Vercel.
- Images remain file/object storage, not database rows.
- Local image files live under `data/imports/` or `IMPORT_ROOT`.
- Production image URLs are generated from `/imports/*` plus the configured
  public image base.

## Fast Task Routing

| Task | Start with |
| --- | --- |
| Reader does not load or resume | `public/app.js`, `public/readerWindow.mjs`, `public/readingProgress.mjs` |
| Home/search/tag catalog mismatch | `server/contentStore.mjs`, `server/dataStore.mjs`, `server/postgresStore.mjs` |
| Admin list/edit/crawl UI issue | `public/routes/admin.mjs`, `server/index.mjs`, `server/crawlJobStore.mjs` |
| Local DB/pgAdmin issue | `docs/agent-playbooks/local-postgres-pgadmin.md`, `server/storageConfig.mjs` |
| Production image timeout | `docs/agent-playbooks/vercel-s3-publishing.md`, `server/catalogStore.mjs`, live `/api/reader` payload |
| Vercel route/API issue | `vercel.json`, `api/series.js`, `api/[...path].mjs`, `server/index.mjs` |
| SEO/static export | `server/seo.mjs`, `scripts/write-public-config.mjs` |

## Rules That Prevent Expensive Mistakes

- Do not run full S3 sync unless the user explicitly asks.
- For one series, prefer `npm run publish:series -- --series-id <id>`.
- For image-only publish, prefer a per-series S3 sync command.
- Never upload `data/imports/` to Vercel.
- Never commit secrets or `.env.local`.
- Do not assume production image failures are Vercel bugs; fetch the exact
  image URL from the reader API and test the object origin.
- Do not delete `draft` or `removed` rows just because they are hidden publicly.

## Verification Ladder

Choose the smallest check that proves the change:

```powershell
node --check public\app.js
node --check public\routes\admin.mjs
node --check server\index.mjs
npm test
```

For local DB changes:

```powershell
npm run db:setup:schema
```

For production reader image issues:

1. Check the public page route.
2. Check `/api/series?series=<slug-or-id>`.
3. Check `/api/reader?series=<slug>&chapter=<chapter>&window=0`.
4. Copy the first image URL from the payload and test that exact URL.

## Worktree Expectations

This repo is often dirty because static export produces many files under
`public/`. Do not revert unrelated changes. If the task is documentation,
stage or describe only the docs files you intentionally changed.
