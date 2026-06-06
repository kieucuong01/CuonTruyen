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
DATABASE_URL=<Supabase pooler connection string>
POSTGRES_SSL_REJECT_UNAUTHORIZED=false
ADMIN_EMAIL=<admin email>
ADMIN_PASSWORD=<admin password>
ADMIN_TOKEN=<strong random token>
STATIC_API_MODE=false
API_BASE_URL=https://cuontruyen.vercel.app
PUBLIC_SITE_URL=https://cuontruyen.vercel.app
PUBLIC_IMPORTS_BASE_URL=https://s3.vn-hcm-1.vietnix.cloud/cuontruyen
```

When `DATABASE_URL` or `POSTGRES_URL` exists on Vercel, the build writes
`staticApiMode=false` unless `FORCE_STATIC_API_MODE=true` is explicitly set.
This lets the public site and production admin use live Vercel API routes backed
by Supabase Postgres.

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

Public static API prefix:

```text
/static-api/
```

Expected examples:

```text
https://s3.vn-hcm-1.vietnix.cloud/cuontruyen/static-api/home.json
https://s3.vn-hcm-1.vietnix.cloud/cuontruyen/static-api/series.json
https://s3.vn-hcm-1.vietnix.cloud/cuontruyen/imports/<seriesId>/<chapterId>/<image>
```

## Production Admin Mode

Production `/admin` is enabled, but it is content-only:

```text
Allowed: login, catalog, metadata edits, series status, chapter status, events.
Hidden: crawl, update chapters, optimize images, sync S3, production pipeline.
```

The heavy controls only show on localhost/private LAN hosts or when:

```text
ENABLE_LOCAL_CRAWLER_UI=true
```

Do not enable heavy crawler UI on Vercel production.

## Local Runtime

Local app/admin:

```text
http://localhost:54533
http://localhost:54533/#/admin
```

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

Local image/catalog root:

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
npm run export:static-api
npm run sync:s3:dry-run
npm run sync:s3
```

If production uses live Supabase API, the most important publish step is syncing
images to S3 after the local crawler has written catalog changes to the same
Supabase database. Static API export/sync can still be used as fallback/cache,
but Vercel no longer needs it for admin edits to appear.

If frontend code changed, commit and push to `main`; Vercel deploys production
from Git automatically.

## Known Operational Notes

- Full image sync can take a long time because the library has tens of thousands of image files.
- S3 image sync is fail-safe by default: normal image publish must pass `--series-id <series-id>`, retry failed files uses `--retry-failed`, and full image sync requires explicit `--all`.
- If Vietnix S3 returns `RequestTimeTooSkewed`, sync the Windows clock (`w32tm /resync`) and use the admin "Retry file thiếu" button or `npm run sync:s3:retry-failed`.
- `S3_ACL=public-read` is needed for objects to be readable through the current S3 public URL.
- `.vercelignore` must keep `data/`, `logs/`, `.runtime/`, and local env files out of deploy uploads.
- Custom domain `img.cuontruyen.com` is not configured yet. If added, update `PUBLIC_IMPORTS_BASE_URL`, `S3_PUBLIC_BASE_URL`, and `STATIC_API_BASE_URL`.
