# Current Deployment State

This file records the current production-ish setup so future developers and AI agents do not have to rediscover it.

## Public Frontend

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

Production environment variables on Vercel:

```text
STATIC_API_MODE=true
STATIC_API_BASE_URL=https://s3.vn-hcm-1.vietnix.cloud/cuontruyen/static-api
PUBLIC_SITE_URL=https://cuontruyen.vercel.app
```

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
npx vercel@latest deploy --prod --yes
```

If only images/static JSON changed and frontend code did not change, a Vercel redeploy is usually not required. The browser reads S3 JSON directly.

## Known Operational Notes

- Full image sync can take a long time because the library has tens of thousands of image files.
- `S3_ACL=public-read` is needed for objects to be readable through the current S3 public URL.
- `.vercelignore` must keep `data/`, `logs/`, `.runtime/`, and local env files out of deploy uploads.
- Custom domain `img.cuontruyen.com` is not configured yet. If added, update `PUBLIC_IMPORTS_BASE_URL`, `S3_PUBLIC_BASE_URL`, and `STATIC_API_BASE_URL`.
