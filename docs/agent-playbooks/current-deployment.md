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
Output directory: public
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

Public JSON snapshots should stay same-origin on Vercel:

```text
publicSnapshotBaseUrl=/static-api
preferPublicSnapshots=true
```

Do not point `PUBLIC_SNAPSHOT_BASE_URL` at Vietnix S3 unless the full
`static-api/` tree, including `static-api/series/<slug>.json`, is synced there.
Missing detail snapshots force the browser to fall back to slower live API
reads.

When catalog storage resolves to PostgreSQL on Vercel, the build writes
`CATALOG_STORAGE=postgres` is set without `CATALOG_DATABASE_URL`,
`DATABASE_URL`, or `POSTGRES_URL`, the build fails loudly instead of silently
live Vercel API routes backed by Supabase Postgres.

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

Local app/admin:

```text
http://localhost:54533
http://localhost:54533/#/admin
```

Local catalog storage uses a separate PostgreSQL database on the Windows
machine, not the production Supabase database. It is managed through pgAdmin4:

```text
Host: 127.0.0.1
Port: 5432
Database: comic_reader_local
App user: comic_user
```

`.env.local` should point to:

```env
CATALOG_STORAGE=postgres
CATALOG_DATABASE_URL=postgres://comic_user:comic_local_password@127.0.0.1:5432/comic_reader_local
POSTGRES_SSL=false
```

Run schema setup after DB creation, restore, or schema changes:

```powershell
npm run db:setup:schema
```

The old Docker Postgres port `55432` is no longer the intended local database.
If Docker Desktop starts `cuontruyen-local-postgres` again, stop it unless you
are intentionally recovering old data.

Local server, worker, admin, and production sync all read the catalog through
the same `server/dataStore.mjs` facade. Start the local server and the crawl
worker with the same catalog env, otherwise admin may show one catalog while
the worker writes jobs/content to another database.

If local crawl suddenly fails with a Postgres error such as `role "comic_user"
does not exist`, check `docs/agent-playbooks/local-postgres-pgadmin.md`,
confirm PostgreSQL service `postgresql-x64-18` is running, and rerun
`npm run db:setup:schema`. The admin local S3 panel shows the active catalog
storage to make mismatches easier to spot.

Local crawler:

```powershell
$env:CRAWL_EMBEDDED_WORKER='false'
$env:CRAWL_IMAGE_CONCURRENCY='6'
$env:CRAWL_OPTIMIZE_DURING_CRAWL='false'
npm run dev
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
- `.vercelignore` must keep `data/`, `logs/`, `.runtime/`, and local env files out of deploy uploads.
