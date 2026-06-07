# Current Deployment State

This file records the current production-ish setup so future developers and AI agents do not have to rediscover it.

## Public Frontend And Admin API

Vercel project:

```text
cuontruyen
```

Default production domain:

```text
https://cuontruyen.vercel.app
```

Vercel project config:

```text
Build command: npm run build:vercel
Output directory: Next.js default
Project config file: vercel.json
Ignored deploy paths: .vercelignore
```

Git auto deploy:

```text
GitHub repo: kieucuong01/CuonTruyen
Production branch: main
Behavior: push to main triggers a Vercel production deployment automatically.
```

Do not use local Vercel CLI as the normal deployment path. The project has many
generated static files, so direct CLI upload can hit Vercel's free upload request
limit. If CLI deploy is ever needed as a fallback, use:

```powershell
npx vercel@latest deploy --prod --yes --archive=tgz
```

Production environment variables on Vercel:

```text
CATALOG_STORAGE=postgres
DATABASE_URL=<Supabase pooler connection string>
POSTGRES_SSL_REJECT_UNAUTHORIZED=false
ADMIN_EMAIL=<admin email>
ADMIN_PASSWORD=<admin password>
ADMIN_TOKEN=<strong random token>
API_BASE_URL=https://cuontruyen.vercel.app
PUBLIC_SITE_URL=https://cuontruyen.vercel.app
PUBLIC_IMPORTS_BASE_URL=https://s3.vn-hcm-1.vietnix.cloud/cuontruyen
```

On Vercel/production, `PUBLIC_IMPORTS_BASE_URL` makes live API payloads rewrite
`/imports/*` image paths to the public S3 base automatically. Local development
keeps raw `/imports/*` paths by default so the reader can use local files while
crawling. Set `PUBLIC_IMPORTS_BASE_URL_ENABLED=true` locally only when you want
to force S3 URLs, or `PUBLIC_IMPORTS_BASE_URL_ENABLED=false` to force raw local
paths.

When catalog storage resolves to PostgreSQL on Vercel, `npm run build:vercel`
requires `CATALOG_DATABASE_URL`, `DATABASE_URL`, or `POSTGRES_URL`; the build
fails loudly instead of silently deploying a reader without catalog data. The
build writes `public/config.js`, skips the legacy static SEO export, then runs
`next build`.

Vercel deploy uploads should exclude the legacy SPA/static export surface. The
local Node app can still use `public/index.html`, `public/app.js`,
`public/routes/`, `public/static-api/`, and `public/fallback-api/`, but
`.vercelignore` keeps those files out of production so App Router owns public
HTML, APIs, sitemap, robots, and policy pages.

Public App Router SEO/read surfaces stay build-safe with `force-dynamic`
because local and CI builds may not have a live catalog database. They still use
short CDN cache headers: public HTML routes (`/`, `/truyen/:slug`,
`/truyen/:slug/:chapter`, `/the-loai/:slug`), static SEO pages
(`/gioi-thieu`, `/lien-he`, `/chinh-sach-noi-dung`, `/privacy`), public read
APIs, `robots.txt`, and `sitemap.xml` emit `Cache-Control: public,
s-maxage=300, stale-while-revalidate=600` for successful public responses.
Error and 404 JSON responses stay `no-store`. Admin, user/session, analytics
events, and local-only pipeline routes remain dynamic/no-store.

The public Next SEO pages also render compact JSON-LD:
`WebSite`/`ItemList` on `/`, `ComicSeries` on series pages, `ComicIssue` on
reader pages, and `CollectionPage` on tag pages. These scripts are generated in
the App Router layer without serializing full chapter page arrays.

The homepage "Đọc tiếp" client island is intentionally small. It does not
receive the full public series/chapter index; when a saved series exists in
localStorage it fetches only that series through the CDN-cacheable public series
API.

Internal navigation inside the Next App Router surface uses `next/link` instead
of raw anchors so public/admin route changes can use App Router prefetching and
avoid full reloads.

## Public Storage

Vietnix S3 bucket:

```text
cuontruyen
```

Public base URL:

```text
https://s3.vn-hcm-1.vietnix.cloud/cuontruyen
```

Public image prefix:

```text
/imports/
```


```text
```

Expected examples:

```text
https://s3.vn-hcm-1.vietnix.cloud/cuontruyen/imports/<seriesId>/<chapterId>/<image>
```

## Production Admin Mode

Production `/admin` is enabled, but it is content-only:

```text
Allowed: login, catalog, metadata edits, tag/origin edits, series status, chapter status, bulletin messages, analytics/events.
Hidden: crawl, update chapters, optimize images, sync S3, production pipeline.
```

The heavy controls only show on localhost/private LAN hosts or when:

```text
ENABLE_LOCAL_CRAWLER_UI=true
```

Do not enable heavy crawler UI on Vercel production.

The server also blocks local-only production pipeline calls on Vercel. Even if a hidden button is called manually, `POST /api/admin/series/:id/publish-production` should return `503` unless the app is running locally or `ENABLE_LOCAL_CRAWLER_UI=true` is explicitly set.

## Local Runtime

Local Next app/content admin:

```text
http://localhost:54533
http://localhost:54533/admin
```

Local crawler/pipeline admin:

```text
http://localhost:54534/#/admin
```

Local catalog storage defaults to a separate PostgreSQL database on the machine,
not the production Supabase database. Initialize it with:

```powershell
npm run db:local:setup
```

That starts `docker-compose.local.yml`, writes the local catalog DB URL to

sync all read the catalog through the same `server/dataStore.mjs` facade. That
means switching local from JSON to Postgres changes the source of truth for the
whole production pipeline. Start the local pipeline server and the crawl worker
with the same catalog env, otherwise admin may show one catalog while the worker
writes jobs/content to another storage backend.

If local crawl suddenly fails with a Postgres error such as `role "comic_user"
does not exist`, fix the local DB with `npm run db:local:setup` or intentionally
`npm run worker:crawl`. The admin local S3 panel shows the active catalog
storage to make this mismatch easier to spot.

Local crawler:

```powershell
$env:CRAWL_EMBEDDED_WORKER='false'
$env:CRAWL_IMAGE_CONCURRENCY='6'
$env:CRAWL_OPTIMIZE_DURING_CRAWL='false'
$env:PORT='54534'
npm run local:pipeline
npm run worker:crawl
```

Run only one crawler worker at a time. The server does not run the embedded
crawler unless `CRAWL_EMBEDDED_WORKER=true`, which avoids JSON queue lock errors
when a separate `npm run worker:crawl` process is active. The worker also keeps
a local `crawl-worker.lock` heartbeat so two Node processes do not claim crawl
jobs at the same time.

Use `CRAWL_IMAGE_CONCURRENCY=6` as the fast default. Lower to `4` if the source
rate-limits or returns many `fetch failed` errors; raise to `8` only when the
source is stable. Keep `CRAWL_OPTIMIZE_DURING_CRAWL=false` for faster crawling,
then run the image optimization scripts after the crawl completes.

## Next.js Migration Runtime

The branch `nextjs-layered-app-router` makes Next.js App Router the default app
runtime for public SEO routes, reader, content admin, and request-scoped API
handlers. The legacy Node server remains available only for local
crawler/optimizer/S3/publish workflows.

Default app commands:

```powershell
npm run dev
npm run build
npm run start
```

Local-only pipeline commands:

```powershell
npm run local:pipeline
npm run dev:legacy
npm run worker:crawl
```

`npm run dev:next`, `npm run build:next`, and `npm run start:next` remain as
aliases for the default Next commands. Worker, crawler, optimizer, S3 sync,
production publish, and crawler-triggering admin APIs remain on the legacy local
runtime and must not be moved into Vercel Functions.

Public read APIs are mirrored into App Router route handlers under `src/app/api`
for the Next public layer: home, search, tags, series detail, and reader chapter
payloads. These public read routes use 300-second CDN cache headers for faster
Vercel responses while still refreshing shortly after local publish/DB promotion.
Home, series detail, and tag data adapters read catalog summaries without
chapter page arrays; reader payloads are the only public App Router path that
requests page arrays. The public pages use request-level React `cache()`
wrappers so `generateMetadata()` and route rendering can reuse the same catalog
lookup for a request.
Next also owns the static policy pages (`/gioi-thieu`, `/lien-he`,
`/chinh-sach-noi-dung`, `/privacy`), custom noindex 404, `robots.txt`, and
`sitemap.xml`.
User auth, Google auth callbacks, bulletin messages, admin session,
admin-bulletin messages, `/api/events`, admin catalog/editor endpoints, chapter
moderation, crawl-schedule metadata, and admin analytics/events now have App
Router route handlers. `/admin` is a route-scoped Next client dashboard and
`/admin/series/:id` is a route-scoped Next content editor; neither page loads
the legacy `/app.js` bundle. Vercel no longer rewrites admin pages to
`public/index.html`, and there is no legacy Vercel API catch-all wrapper.
Local-only crawler/import/S3/publish endpoints are represented by App Router
stubs that return authenticated `503` responses on Vercel with instructions to
run the workflow in admin local/crawler.


```text
data/imports/
```

Secrets are in:

```text
.env.local
```

Do not commit `.env.local`.

## Publish After Crawling

After importing or updating chapters locally:

```powershell
npm run sync:s3:dry-run
npm run sync:s3
```

Those commands are static fallback/S3 utilities, not the complete production
publish flow when Vercel reads live Postgres/Supabase API. Prefer
`npm run publish:series -- --series-id <series-id>` for one-series production
publishing.

If production uses live Supabase API, the most important publish step is syncing
images to S3 after catalog changes have been promoted to the production
database. Local development uses its own Postgres database by default, so do not
edits that already exist in the production DB.

For local crawler -> production DB promotion, set one dedicated target env var
on the local machine:

```text
PRODUCTION_CATALOG_DATABASE_URL=<production Supabase/Postgres connection string>
```

`DATABASE_URL` or `CATALOG_DATABASE_URL` remains the source catalog for the
running local server/worker. The production pipeline syncs one selected series
to the target DB with:

```powershell
npm run sync:catalog:production -- --series-id <series-id> --apply
```

For the full DB-aware local publish flow from CLI, use:

```powershell
npm run publish:series -- --series-id <series-id> --dry-run
npm run publish:series -- --series-id <series-id>
```

This command fails fast if required S3 env vars or production DB target env vars
are missing, before running optimize/upload work. The `--dry-run` form only
prints the planned commands and does not optimize, upload, export, or upsert.
Some planned commands include `--apply` because that is what the real run will
execute, but dry-run never starts those child commands.

Retry only selected steps when needed:

```powershell
npm run publish:series -- --series-id <series-id> --steps sync-images,sync-catalog-db
```

Valid `--steps` values are `optimize`, `sync-images`, `sync-catalog-db`,

The script logs `sameDatabase=true` when the local source catalog and production
target URL are identical; in that setup crawls already write to the production
DB and the DB sync step is effectively an idempotent confirmation.

The local admin pipeline fails fast before optimize/S3 work if `Sync catalog DB`
is selected but no production DB target env is configured. This prevents a
half-published state where images were uploaded but the live Vercel API cannot
see the new series/chapter rows.

For normal image publish, sync by series instead of full bucket:

```powershell
node scripts/sync-vietnix-s3.mjs --images-only --catalog-only --series-id <series-id> --apply
```

The admin local production check verifies:

- production series page
- cover image on S3
- first readable chapter image on S3
- static series API JSON
- static reader API JSON

If frontend code changed, commit and push to `main`; Vercel deploys production
from Git automatically.

## Known Operational Notes

- Full image sync can take a long time because the library has tens of thousands of image files.
- S3 image sync is fail-safe by default: normal image publish must pass `--series-id <series-id>`, retry failed files uses `--retry-failed`, and full image sync requires explicit `--all`.
- If Vietnix S3 returns `RequestTimeTooSkewed`, sync the Windows clock (`w32tm /resync`) and use the admin "Retry file thiếu" button or `npm run sync:s3:retry-failed`.
- `S3_ACL=public-read` is needed for objects to be readable through the current S3 public URL.
- `.vercelignore` must keep `data/`, `logs/`, `.runtime/`, local env files,
  legacy SPA files, legacy static API exports, and old static SEO HTML out of
  deploy uploads.
