# Vercel + Vietnix S3 Publishing

This project can run public traffic with a lightweight Vercel Node API backed by
Supabase Postgres, while still serving comic images from S3-compatible object
storage. Static API export remains useful as a fallback/cache path, but
production admin/content edits should use the live API.

## Target Architecture

```text
Local machine
- Admin UI
- Crawler
- data/imports image library
- PostgreSQL catalog through the same DB URL as production
- optional legacy catalog.json fallback only when DB mode is intentionally disabled

Vietnix S3 Object Storage
- /imports/* optimized images
- /static-api/* public JSON payloads

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

Current static API base:

```text
https://s3.vn-hcm-1.vietnix.cloud/cuontruyen/static-api
```

If a custom image domain is added later, replace the S3 public base with:

```text
https://img.cuontruyen.com
```

## Required Secrets

Put real values in `.env.local`:

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
https://img.example.com/static-api/home.json
```

Bucket requirements:

- Public read for objects under `imports/` and `static-api/`.
- No public bucket listing.
- CORS allows `GET` and `HEAD` from the Vercel domain.
- HTTPS custom domain is strongly preferred.
- Image objects should keep long cache headers.
- Static API JSON should keep short cache headers, usually 60 seconds.

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

### Content/static API publish

After crawling or updating chapters locally:

```powershell
$env:PUBLIC_IMPORTS_BASE_URL='https://img.example.com'
npm run export:static-api
```

For a newly completed crawl, prefer syncing only that series' images first:

```powershell
node scripts/sync-vietnix-s3.mjs --images-only --catalog-only --series-id <series-id> --apply
node scripts/sync-vietnix-s3.mjs --static-api-only --apply --force
```

The S3 script refuses full image sync unless a series id, `--retry-failed`, or
explicit `--all` is provided. This prevents accidentally rechecking hundreds of
thousands of images.

The production pipeline in local admin should run per selected series:

```text
Choose series -> crawl/update chapters -> optimize images -> sync that series images -> export static API -> sync static API -> check production
```

Do not use `npm run sync:s3` as the default daily flow because it can become a full image run. Use a scoped `--series-id` image sync plus static API sync.

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
- `/static-api/series/<series-slug>.json` exists.
- `/static-api/reader/<series-slug>/<chapter-slug>.json` exists.

If one image check fails but static API is OK, retry S3 failed files first. If static API fails, rerun `npm run export:static-api` and then `node scripts/sync-vietnix-s3.mjs --static-api-only --apply --force`.

If production uses live Supabase API, make sure the local crawler writes to the
same `DATABASE_URL` as Vercel. Then admin/public catalog edits appear through the
Vercel API without waiting for static API export. S3 sync is still required for
new images.

## Vercel Environment

Set these in Vercel:

```text
CATALOG_STORAGE=postgres
DATABASE_URL=<Supabase pooler connection string>
POSTGRES_SSL_REJECT_UNAUTHORIZED=false
ADMIN_EMAIL=<admin email>
ADMIN_PASSWORD=<admin password>
ADMIN_TOKEN=<strong random token>
STATIC_API_MODE=false
API_BASE_URL=https://cuontruyen.vercel.app
PUBLIC_IMPORTS_BASE_URL=https://img.example.com
```

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
- With `CATALOG_STORAGE=postgres`, newly crawled catalog changes appear after the local crawler writes to Supabase and images are synced to S3.
- If production is forced back to static API mode, the public Vercel site does not show newly crawled chapters until `export:static-api` and `sync:s3` run.
- If images are missing on Vercel, check `PUBLIC_IMPORTS_BASE_URL` during `export:static-api`.
- If data is stale, check `STATIC_API_BASE_URL` and S3 cache headers.
- If admin fails on Vercel, check the serverless `/api/admin/session` route, `DATABASE_URL`, admin env vars, and `API_BASE_URL`.
- Do not upload `data/imports/` to Vercel. `.vercelignore` excludes it.
- Do not commit `.vercel/project.json`; `.gitignore` excludes `.vercel/`.
