# SEO launch checklist

Use this when preparing Cuon Truyen for public indexing.

## Production URL preflight

- Set `PUBLIC_SITE_URL` or `PRODUCTION_BASE_URL` to the final public domain before export/deploy.
- Open `/sitemap.xml` and confirm every URL uses the production domain, not localhost.
- Open `/robots.txt` and confirm it allows public pages but blocks admin/API/static JSON surfaces.
- Confirm public images use the Vietnix S3 `importsBaseUrl` and load from a browser without admin login.

## Clean sitemap rules

- Include `/`, static policy pages, public series pages, public imported chapter pages, and public tag pages.
- Exclude `draft` and `removed` series/chapters.
- Exclude tag pages with `seriesCount` equal to `0`.
- Keep origin landing pages indexable when they have public content:
  - `/the-loai/manhwa`
  - `/the-loai/manhua`
  - `/the-loai/truyen-han`
  - `/the-loai/truyen-trung`

## Robots rules

Expected production behavior:

- `Allow: /`
- `Disallow: /admin`
- `Disallow: /api/`
- `Disallow: /static-api/`
- `Disallow: /fallback-api/`
- `Allow: /imports/`
- `Sitemap: https://<domain>/sitemap.xml`

Do not block `/imports/`; comic images are part of public reading pages.

## Search Console launch

1. Add the production domain in Google Search Console.
2. Prefer Domain property if DNS access is available; otherwise use URL-prefix property for the exact `https://` domain.
3. Verify ownership with the method Google provides, usually DNS TXT, HTML file, or meta tag.
4. Submit `https://<domain>/sitemap.xml`.
5. Use URL Inspection for these samples:
   - `https://<domain>/`
   - `https://<domain>/gioi-thieu`
   - `https://<domain>/the-loai/manhwa`
   - `https://<domain>/the-loai/manhua`
   - `https://<domain>/the-loai/truyen-han`
   - `https://<domain>/the-loai/truyen-trung`
   - one high-value `/truyen/<slug>` page
   - one high-value `/truyen/<slug>/<chapter>` page
6. Request indexing only after the page returns HTTP 200, has a canonical URL, and is not blocked by robots.
7. Recheck Pages and Sitemaps reports after Google recrawls.

## Static copy review

Production static pages are generated from `server/seo.mjs`:

- Homepage/default metadata: position Cuon Truyen as a mobile-first comic reader for Manhwa, Manhua, and Manga, not as a prototype.
- `/gioi-thieu`: product positioning, mobile reader benefits, continue-reading behavior.
- `/lien-he`: bug reports, missing chapters/images, content handling requests.
- `/chinh-sach-noi-dung`: public/draft/removed moderation behavior, takedown handling, sitemap exclusion.
- `/privacy`: localStorage reading progress, login/session tokens, analytics/ad/donate events.
- `/the-loai/manhwa`: Manhwa / Korean comics landing page.
- `/the-loai/manhua`: Manhua / Chinese comics landing page.
- `/the-loai/truyen-han`: Korean-origin comics landing page.
- `/the-loai/truyen-trung`: Chinese-origin comics landing page.

When editing these pages, keep copy factual and avoid promising licensing or response SLAs unless the owner has a real process for them.

Tag page copy is centralized in `tagSeoCopy()` in `server/seo.mjs`. If a new high-value tag needs custom SEO copy, add it there so both dynamic API rendering and Vercel static HTML generation stay consistent.

## Verification commands

Run from repo root:

```powershell
node --check server\seo.mjs
node --check server\contentStore.mjs
node --check server\index.mjs
node --check scripts\write-public-config.mjs
npm run check:encoding
npm test
```

If exporting static API for Vercel/S3:

```powershell
npm run export:static-api
```
