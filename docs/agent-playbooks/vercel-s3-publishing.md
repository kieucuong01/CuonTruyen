# Vercel + Vietnix S3 Publishing

This project can run public traffic without a public Node backend by exporting public catalog data to static JSON and serving comic images from S3-compatible object storage.

## Target Architecture

```text
Local machine
- Admin UI
- Crawler
- data/imports image library
- catalog.json / PostgreSQL catalog

Vietnix S3 Object Storage
- /imports/* optimized images
- /static-api/* public JSON payloads

Vercel
- Static frontend from public/
- No crawler
- No image storage
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

After crawling or updating chapters locally:

```powershell
$env:PUBLIC_IMPORTS_BASE_URL='https://img.example.com'
npm run export:static-api
npm run sync:s3:dry-run
npm run sync:s3
```

Dry-run is the safe default for `scripts/sync-vietnix-s3.mjs`. Use `npm run sync:s3` only after the dry-run count looks reasonable.

## Vercel Environment

Set these in Vercel:

```text
STATIC_API_MODE=true
STATIC_API_BASE_URL=https://img.example.com/static-api
API_BASE_URL=
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

- Admin/crawl still happens locally at `http://localhost:54533/#/admin`.
- The public Vercel site does not show newly crawled chapters until `export:static-api` and `sync:s3` run.
- If images are missing on Vercel, check `PUBLIC_IMPORTS_BASE_URL` during `export:static-api`.
- If data is stale, check `STATIC_API_BASE_URL` and S3 cache headers.
- If admin is needed from Vercel, expose a real backend API and set `API_BASE_URL`; otherwise keep admin local only.
