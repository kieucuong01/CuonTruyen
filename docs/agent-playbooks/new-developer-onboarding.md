# New Developer Onboarding

This is the shortest path for a new human developer to understand and run the
project without rediscovering the local setup.

## What This Project Is

CuonTruyen is a local-first Vietnamese comic reader, crawler, admin, and
publishing prototype.

The product priorities are:

- Fast continuous reading across chapters.
- Reliable "Doc tiep" resume behavior.
- Easy local crawl/admin/debug workflows.
- Public catalog safety: only `public` series and chapters appear outside admin.
- Low-cost production hosting with Vercel, Postgres, and S3-compatible image storage.

## Current Runtime Shape

```text
Browser frontend: public/
Node HTTP server/API: server/index.mjs
Catalog/users/events/crawl jobs: PostgreSQL
Local images: data/imports/ or IMPORT_ROOT
Production images: Vietnix S3, optionally behind CDN later
Production frontend/API: Vercel
Production catalog DB: Supabase/Postgres
```

Local development currently uses the PostgreSQL installed on this Windows
machine, visible in pgAdmin4:

```text
Host: 127.0.0.1
Port: 5432
Database: comic_reader_local
App user: comic_user
```

The old Docker Postgres port `55432` is no longer the intended local DB.

## First Setup

Install dependencies:

```powershell
npm install
```

Make sure `.env.local` points to the local machine database:

```env
CATALOG_STORAGE=postgres
CATALOG_DATABASE_URL=postgres://comic_user:comic_local_password@127.0.0.1:5432/comic_reader_local
POSTGRES_SSL=false
```

Initialize or upgrade schema:

```powershell
npm run db:setup:schema
```

If `npm` fails because of Windows user-folder permission issues in this Codex
desktop environment, run the same script directly with the bundled Node runtime
or fix local npm permissions. The database/schema itself is not the cause.

## Run Locally

Start the app:

```powershell
$env:PORT='54533'
npm run dev
```

Open:

```text
http://localhost:54533
http://localhost:54533/#/admin
```

Run the crawl worker only when crawl jobs should execute:

```powershell
npm run worker:crawl
```

Keep exactly one crawl worker running at a time.

## Normal Development Loop

1. Read `AGENTS.md` and `docs/agent-playbooks/agent-token-map.md`.
2. Find the subsystem in the token map before broad searches.
3. Make a small focused change.
4. Run the smallest relevant checks.
5. Smoke-check the exact route or admin flow changed.

Common checks:

```powershell
node --check public\app.js
node --check public\routes\home.mjs
node --check public\routes\admin.mjs
npm test
```

## Safety Rules

- Do not commit `.env.local`, S3 credentials, `.vercel/`, logs, or `.runtime/`.
- Do not delete or rewrite `data/imports/` unless explicitly requested.
- Do not run a full S3 sync by default.
- Do not move long-running crawl jobs into Vercel Functions.
- Public APIs, static snapshots, and sitemap must exclude `draft` and `removed`.
- Admin must keep `draft` and `removed` visible for review and recovery.

## Where To Read Next

- Architecture and product rules: `docs/agent-playbooks/comic-reader.md`
- Local DB and pgAdmin: `docs/agent-playbooks/local-postgres-pgadmin.md`
- Frontend/admin map: `docs/agent-playbooks/frontend-map.md`
- Production/S3 publishing: `docs/agent-playbooks/vercel-s3-publishing.md`
- AI agent handoff: `docs/agent-playbooks/ai-agent-handoff.md`
