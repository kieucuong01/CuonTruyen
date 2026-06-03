# Vietnamese Comic Reader

Local-first comic reader and crawler for Vietnamese manhua/manhwa workflows. The current goal is to get the product ready for public traffic before buying a VPS: safe publishing controls, crawlable SEO pages, useful admin review, and a reader that keeps people coming back.

## Product Priorities

- Smooth continuous reading across chapters without pressing next.
- Reliable "Doc tiep" resume behavior using browser storage.
- Local-first crawling and image caching that is easy to inspect.
- Admin-first content review before public growth.
- SEO traffic plus light monetization later, without making the reader feel spammy.

## Current Features

- Public home, search, tag, series, and chapter routes.
- Continuous reader with chapter drawer, current chapter tracking, image preloading, and saved progress.
- Local user session, follow list, and reading history using browser storage.
- Admin login for crawl/import and content management.
- Multi-URL durable crawl jobs with worker mode, retries, per-domain delay, and progress counters.
- Local JSON storage by default, PostgreSQL catalog mode when `DATABASE_URL` or `POSTGRES_URL` is set.
- Cached images served from `data/imports/` or `IMPORT_ROOT` through `/imports/*`.
- Optional Vercel static frontend mode with images and public JSON served from S3-compatible storage.
- Series and chapter moderation with `public`, `draft`, and `removed` statuses.
- Static SEO/policy pages: `/gioi-thieu`, `/lien-he`, `/chinh-sach-noi-dung`, `/privacy`.
- Sitemap and public APIs exclude draft/removed content.

## Quick Start

Run from the repo root:

```powershell
npm test
$env:PORT='54533'; npm run dev
```

Open:

```text
http://localhost:54533/
```

Admin/crawl screen:

```text
http://localhost:54533/#/admin
```

The desktop session commonly uses port `54533`.

## Useful Scripts

```powershell
npm run dev
npm run worker:crawl
npm run worker:crawl:once
npm run smoke:import
npm run export:static-api
npm run sync:s3:dry-run
npm run sync:s3
npm run db:migrate:catalog
npm test
```

`npm run dev` starts the HTTP server and public/admin UI. `npm run worker:crawl` should run in a second terminal when admin crawl jobs need to execute. `npm run smoke:import` runs a tiny direct import with low limits.

## Main Routes

Public:

- `/` - home page
- `/truyen/:seriesSlug` - series detail
- `/truyen/:seriesSlug/:chapterSlug` - chapter reader entry
- `/the-loai/:tagSlug` - tag page
- `/gioi-thieu` - about page
- `/lien-he` - contact page
- `/chinh-sach-noi-dung` - content/takedown policy page
- `/privacy` - privacy page
- `/sitemap.xml` and `/robots.txt` - SEO discovery

SPA/internal:

- `#/read/:seriesId` - internal reader by series ID
- `#/admin` - admin import and content review
- `#/following` - local follow list
- `#/history` - local reading history
- `#/search` and `#/genres` - explore views

APIs:

- `GET /api/home` - public home collections
- `GET /api/series` - public catalog only
- `GET /api/search?q=...` - public search
- `GET /api/tags/:tagSlug` - public tag page data
- `GET /api/series/:slug` - public series metadata
- `GET /api/series/:slug/chapters/:chapterSlug` - reader chapter window
- `GET /api/series/:slug/chapters/:chapterSlug/next` - next reader chapter
- `POST /api/events` - lightweight reading/engagement events
- `POST /api/admin/login` - admin session
- `GET /api/admin/series` - admin catalog including draft/removed content
- `PATCH /api/admin/series/:id` - edit series metadata/status/schedule
- `PATCH /api/admin/series/:id/chapters/:chapterId` - edit chapter title/status/takedown reason
- `POST /api/admin/import-jobs` - enqueue one or many crawl jobs
- `GET /api/admin/import-jobs/:id` - crawl job progress

## Project Layout

```text
public/
  app.js                 SPA UI, routes, reader, admin screens
  styles.css             public/admin/reader styling
  readingProgress.mjs    local resume and reading history logic
  userState.mjs          local user/follow state
  readerWindow.mjs       reader windowing and image release helpers
server/
  index.mjs              HTTP server, APIs, SEO/static routes
  contentStore.mjs       public/admin catalog shaping and moderation
  catalogStore.mjs       local JSON catalog and image helpers
  dataStore.mjs          storage facade: PostgreSQL or local JSON
  postgresStore.mjs      PostgreSQL schema and catalog persistence
  importer.mjs           crawl orchestration and image caching
  crawlJobStore.mjs      durable crawl queue: PostgreSQL or JSON
  crawlWorker.mjs        separate crawl worker process
  adapters/              source-specific parsers
migrations/
  001_postgres_catalog.sql
  002_crawl_worker_queue.sql
docs/
  agent-playbooks/       focused handoffs for future agents
  superpowers/           original spec/plan artifacts
tests/
  *.test.mjs             node:test coverage
```

## Content Publishing Workflow

Newly crawled/imported content defaults to `draft`. Use admin review to publish it.

1. Open `/#/admin`.
2. Import or inspect series.
3. Edit title, slug, cover, aliases, tags, description, and crawl schedule.
4. Review chapter rows for missing images or bad titles.
5. Set series/chapter status to `public` when ready.
6. Set status to `removed` for takedown or broken content.

Status behavior:

- `public` appears in home/search/tag/sitemap/reader.
- `draft` remains visible only in admin.
- `removed` remains visible only in admin for audit/recovery.
- Moderation changes never delete cached images from `data/imports/`.

## Data And Storage

Default local runtime data:

```text
data/imports/catalog.json
data/imports/crawl-jobs.json
data/imports/analytics-events.jsonl
data/imports/<seriesId>/<chapterId>/*.jpg
```

Use `IMPORT_ROOT` to move runtime data to another disk path. Do not delete or rewrite `data/imports/` unless explicitly intended; it is the local image library.

## Vercel Frontend + S3 Images

For low-cost public hosting, the recommended split is:

```text
Local machine: admin, crawler, data/imports
Vietnix S3/Object Storage: /imports/* images and /static-api/* public JSON
Vercel: static frontend from public/
```

Local publish flow:

```powershell
$env:PUBLIC_IMPORTS_BASE_URL='https://img.your-domain.com'
npm run export:static-api
npm run sync:s3:dry-run
npm run sync:s3
```

Vercel environment variables:

```text
STATIC_API_MODE=true
STATIC_API_BASE_URL=https://img.your-domain.com/static-api
API_BASE_URL=
```

S3 credentials belong in `.env.local`, not in Git. See `.env.example` and `docs/agent-playbooks/vercel-s3-publishing.md`.

## PostgreSQL Catalog Mode

Set `DATABASE_URL` or `POSTGRES_URL` when local JSON becomes too large:

```powershell
$env:DATABASE_URL='postgres://comic_user:password@127.0.0.1:5432/comic_reader'
npm install
npm run db:migrate:catalog
npm run dev
```

When enabled, metadata, tags, chapters, pages, crawl schedules, and crawl jobs live in PostgreSQL. Images still stay on local/VPS disk under `IMPORT_ROOT` or `data/imports/`.

## Local Production Direction Before VPS

Current recommended path before buying a VPS:

1. Keep running locally on port `54533` for development and content review.
2. Build a clean public catalog with `public` statuses only.
3. Use `/chinh-sach-noi-dung` and admin takedown controls before public growth.
4. Keep backups of `data/imports/`.
5. Move to VPS only after the catalog/review workflow feels stable.

When VPS is purchased later, run the same app with:

- Node server for public APIs and static frontend.
- Crawl worker as a separate long-running process.
- PostgreSQL catalog storage.
- Persistent disk for `IMPORT_ROOT` images.
- Nginx/Caddy HTTPS reverse proxy.
- Regular DB and image backups.

## Environment Variables

See `.env.example` for the full list. Important ones:

- `PORT` - local HTTP port, usually `54533`.
- `PUBLIC_SITE_URL` - canonical public site URL for SEO.
- `PUBLIC_IMPORTS_BASE_URL` - public URL for `/imports/*` image links when frontend/API are split.
- `STATIC_API_MODE` and `STATIC_API_BASE_URL` - make the Vercel frontend read public JSON from S3.
- `S3_*` - Vietnix S3 sync settings for images and static API JSON.
- `CORS_ALLOW_ORIGIN` - exact frontend origin in production.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_TOKEN` - required admin login/session values.
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_ADMIN_MAX`, `RATE_LIMIT_EVENTS_MAX` - basic in-memory protection for admin/import/events.
- `DATABASE_URL` or `POSTGRES_URL` - enables PostgreSQL catalog mode.
- `IMPORT_ROOT` - moves runtime image/catalog files to another disk path.
- `CRAWL_*` variables - worker polling, retry, rate-limit, and schedule tuning.

## Verification

Smallest useful checks:

```powershell
node --check public\app.js
npm test
```

After frontend/admin/reader changes, also smoke-check the local site:

```powershell
$env:PORT='54533'; npm run dev
```

Then inspect:

- Home is not blank.
- Series and chapter routes render.
- Hidden/draft content does not appear publicly.
- Admin can still see draft/removed content.
- Reader opens, images render, current chapter updates, and "Doc tiep" resumes.
- `/sitemap.xml` includes only public content and static pages.

## Agent Handoff

Start with:

- `AGENTS.md`
- `docs/agent-playbooks/agent-token-map.md`
- `docs/agent-playbooks/current-deployment.md`
- `docs/agent-playbooks/comic-reader.md`
- `docs/agent-playbooks/frontend-map.md`
- `docs/agent-playbooks/vercel-s3-publishing.md`
- `docs/agent-playbooks/production-readiness.md`

Key rules:

- Preserve continuous reading and "Doc tiep".
- Do not delete cached imports/images.
- Do not upload `data/imports/` to Vercel.
- Do not commit `.env.local`, S3 credentials, logs, or Vercel metadata.
- Keep source adapters modular.
- Keep public APIs/sitemap filtered to `public` content only.
- For public Vercel issues, check S3 static API and `public/config.js` before debugging the local backend.
- Verify exact user-reported routes when debugging broken URLs.
