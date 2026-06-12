# Vercel + Vietnix S3 Publishing

This project can run public traffic with a lightweight Vercel Node API backed by
Supabase Postgres, while still serving comic images from S3-compatible object
production admin/content edits should use the live API.

## Target Architecture

```text
Local machine
- Admin UI
- Crawler
- data/imports image library
- PostgreSQL catalog through a separate local DB by default

Vietnix S3 Object Storage
- /imports/* optimized images

Vercel
- Frontend from public/
- Lightweight `/api/*` Node functions for public reads and admin content edits
- No crawler
- No image storage
- Production deploys from GitHub when `main` is pushed

Supabase Postgres
- Catalog, chapters, users/admin-backed sessions, bulletin messages, analytics events
```

## Current Live Defaults

Current Vercel default domain:

```text
https://cuontruyen.vercel.app
```

Current Vietnix S3 public base:

```text
https://s3.vn-hcm-1.vietnix.cloud/cuontruyen
```


```text
```

If a custom image domain is added later, replace the S3 public base with:

```text
https://img.cuontruyen.com
```

## Required Secrets

Put real values in `.env.local`. Local catalog DB should point to the installed
Windows PostgreSQL service that is visible in pgAdmin4:

```env
CATALOG_STORAGE=postgres
CATALOG_DATABASE_URL=postgres://comic_user:comic_local_password@127.0.0.1:5432/comic_reader_local
POSTGRES_SSL=false
```

Run `npm run db:setup:schema` after creating/restoring the DB or pulling schema
changes. The old Docker Postgres port `55432` is not the intended local DB
anymore.

S3 values also belong in `.env.local`:

```text
S3_ENDPOINT=
S3_REGION=us-east-1
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PATH_STYLE=true
S3_ACL=public-read
S3_PUBLIC_BASE_URL=https://img.example.com
PUBLIC_IMPORTS_BASE_URL=https://img.example.com
```

Do not commit `.env.local`.

## Bucket Setup

Recommended public paths:

```text
https://img.example.com/imports/<series>/<chapter>/<image>
```

Bucket requirements:

- No public bucket listing.
- CORS allows `GET` and `HEAD` from the Vercel domain.
- HTTPS custom domain is strongly preferred.
- Image objects should keep long cache headers.

## Publish Flow

### Frontend code deploy

Vercel Git Integration is connected to:

```text
kieucuong01/CuonTruyen
```

Pushes to `main` create production deployments automatically. Normal deploy
flow is:

```powershell
git add <changed files>
git commit -m "<message>"
git push origin main
```

Avoid local `vercel deploy` as the normal path. This repo can contain many
generated static files, and local CLI upload can hit Vercel's free upload request
limit. If a manual CLI fallback is unavoidable, use archive upload:

```powershell
npx vercel@latest deploy --prod --yes --archive=tgz
```


After crawling or updating chapters locally:

```powershell
$env:PUBLIC_IMPORTS_BASE_URL='https://img.example.com'
```

For a newly completed crawl, prefer syncing only that series' images first:

```powershell
node scripts/sync-vietnix-s3.mjs --images-only --catalog-only --series-id <series-id> --apply
```

If covers look missing, stretched, or copied from an internal comic page, audit
them first and refresh suspicious thumbnails from the source series page:

```powershell
npm run covers:audit
npm run covers:refresh-source -- --apply
```

After a cover refresh, upload only the regenerated cover object when possible:

```powershell
node scripts/sync-vietnix-s3.mjs --images-only --image-file /imports/<series-id>/_cover/cover.webp --apply --force
```

The S3 script refuses full image sync unless a series id, `--retry-failed`, or
explicit `--all` is provided. This prevents accidentally rechecking hundreds of
thousands of images.

The production pipeline in local admin should run per selected series:

```text
```


Retry only files recorded as failed in the latest S3 status:

```powershell
npm run sync:s3:retry-failed
```

Use `--all` only when you intentionally want to re-upload or recheck everything:

```powershell
node scripts/sync-vietnix-s3.mjs --apply --all
```

Full image sync can take a long time because the current image library is tens
of thousands of files.

If a failed item contains `RequestTimeTooSkewed`, sync the Windows clock first,
then retry failed files:

```powershell
w32tm /resync
npm run sync:s3:retry-failed
```

Dry-run is the safe default for `scripts/sync-vietnix-s3.mjs`. Use `npm run sync:s3` only after the dry-run count looks reasonable.

## Production Check After Sync

After a series publish, use local admin's `Check production` step. It checks:

- `/truyen/<series-slug>` returns OK.
- cover image URL resolves through the public S3 imports base.
- first readable chapter image resolves through the public S3 imports base.


If production uses live Supabase API, local crawler/admin uses a separate local
Postgres database by default. Promote catalog changes intentionally before
expecting them to appear through the Vercel API. S3 sync is still required for
new images.

Set a dedicated target DB URL on the local machine before using the DB sync
step:

```text
PRODUCTION_CATALOG_DATABASE_URL=<production Supabase/Postgres connection string>
```

Then sync one selected series:

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

The script logs `sameDatabase=true` when the local source DB and production
target DB are the same connection string. In that case the DB sync step is
idempotent; keep it in the checklist so the pipeline remains consistent across
local-only and production-DB-direct setups.

## Vercel Environment

Set these in Vercel:

```text
CATALOG_STORAGE=postgres
DATABASE_URL=<Supabase pooler connection string>
POSTGRES_SSL_REJECT_UNAUTHORIZED=false
ADMIN_EMAIL=<admin email>
ADMIN_PASSWORD=<admin password>
ADMIN_TOKEN=<strong random token>
API_BASE_URL=https://cuontruyen.vercel.app
PUBLIC_IMPORTS_BASE_URL=https://img.example.com
```

Live DB-backed API responses on Vercel/production rewrite `/imports/*` image
paths to `PUBLIC_IMPORTS_BASE_URL` automatically when that env is set. Local
development keeps raw `/imports/*` paths by default so reading/crawling can use
local files. Set `PUBLIC_IMPORTS_BASE_URL_ENABLED=true` locally only when you
want to force S3 URLs, or `PUBLIC_IMPORTS_BASE_URL_ENABLED=false` to force raw
local paths.

The Vercel build command is:

```text
npm run build:vercel
```

The output directory is:

```text
public
```

## Operational Notes

- Admin content management is available on production `/admin`.
- Crawl, optimize, and S3 sync still happen locally at `http://localhost:54533/admin`.
- The production admin hides crawl, optimize, S3 sync, and production pipeline controls unless `ENABLE_LOCAL_CRAWLER_UI=true` is explicitly set.
- With `CATALOG_STORAGE=postgres`, local crawls write to the configured DB. The default local setup is separate from production Supabase; production only changes after an intentional DB promotion/backfill.
- If admin fails on Vercel, check the serverless `/api/admin/session` route, `DATABASE_URL`, admin env vars, and `API_BASE_URL`.
- Do not upload `data/imports/` to Vercel. `.vercelignore` excludes it.
- Do not commit `.vercel/project.json`; `.gitignore` excludes `.vercel/`.
