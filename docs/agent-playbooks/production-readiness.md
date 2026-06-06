# Production Readiness Playbook

This playbook captures the current pre-VPS production path for the comic reader.

## Goal

Get the site safe and useful enough for public traffic before buying a VPS. The priority order is content controls, SEO, admin review, then reader conversion polish.

## Current Production-Readiness State

Implemented:

- Admin credentials no longer have code defaults; `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ADMIN_TOKEN` are required.
- `/api/admin/*` and `/api/import` fail closed when admin env is missing.
- `/api/admin/*`, `/api/import`, and `/api/events` have basic in-memory rate limiting.
- Production `/admin` is content-only on Vercel: metadata, tags, status, bulletin, analytics.
- Crawl, update chapters, optimize images, S3 sync, and production pipeline controls are local-only.
- Vercel also rejects direct production pipeline API calls unless local crawler UI is explicitly enabled.
- Series and chapter statuses: `public`, `draft`, `removed`.
- New imports default to `draft`.
- Recrawls preserve existing public moderation where appropriate.
- Public catalog, home, search, tag pages, reader payloads, and sitemap filter to public content only.
- Admin catalog endpoint can still see draft/removed content.
- Admin UI can edit series metadata, crawl schedule, and chapter status/title/takedown reason.
- SEO static pages exist at `/gioi-thieu`, `/lien-he`, `/chinh-sach-noi-dung`, and `/privacy`.
- SEO production copy has been reviewed for default metadata, static policy pages, and origin tag pages.
- Tag SEO copy for Manhwa, Manhua, Korean comics, and Chinese comics is centralized in `tagSeoCopy()` in `server/seo.mjs`.
- Missing or hidden public series/chapter/tag routes return a clean 404 HTML shell.
- Reader has stronger continue CTAs and neutral chapter breaks instead of an intrusive ad placeholder.
- S3 image sync is scoped by series by default, records failed files, supports retry-failed, and local admin can check production assets after sync.

Not yet done:

- Real AdSense slot values and real donate destination.
- VPS deployment scripts/process manager setup.
- Browser-automated visual QA in sessions where the browser tool is unavailable.

## Content Review Flow

1. Run the server locally.
2. Open `/#/admin`.
3. Import one or many URLs.
4. Let `npm run worker:crawl` process queued jobs.
5. Review each series:
   - title
   - slug
   - cover URL
   - aliases
   - tags
   - description
   - crawl schedule
   - series status
6. Review each chapter:
   - title/label
   - page count
   - missing-image flags
   - status
   - takedown reason if hidden
7. Publish only clean content by setting series and desired chapters to `public`.
8. Hide bad/risky content with `removed` instead of deleting images.

## SEO Checklist

Before public launch:

- `PUBLIC_SITE_URL` points to the canonical domain.
- `/sitemap.xml` returns only public series, public chapters, tags, and static policy pages.
- `/robots.txt` points to the sitemap.
- Public series pages have useful title, description, canonical, Open Graph, and JSON-LD.
- Tag pages have production copy for Manhwa, Manhua, Truyen Han, and Truyen Trung.
- Static policy/contact/privacy pages are reachable and linked in the UI or footer/nav.
- Removed/draft URLs return a clean 404 HTML shell.

Google Search Console smoke:

- Submit `https://<domain>/sitemap.xml`.
- Inspect `/`, `/gioi-thieu`, one public series page, one public chapter page, and origin tag pages.
- Request indexing only after the live URL test returns HTTP 200 and is not blocked by robots.

## Reader Checklist

Keep these behaviors intact:

- Continuous scroll loads next public chapter only.
- Hidden/draft chapters never appear in the stream.
- Current chapter label updates while scrolling.
- `Doc tiep` opens the saved series/chapter/position.
- Reader remains lightweight on mobile.
- Follow/history remain localStorage-based until real auth is intentionally added.

## Local Pre-VPS Operating Mode

Use this while content and product flow are still being shaped:

```powershell
$env:PORT='54533'; npm run dev
```

Run worker separately when crawling:

```powershell
npm run worker:crawl
```

Back up runtime data regularly:

```text
data/imports/catalog.json
data/imports/crawl-jobs.json
data/imports/analytics-events.jsonl
data/imports/<seriesId>/...
```

## When To Buy VPS

Buy VPS only after:

- Admin review flow feels fast enough.
- Public catalog has enough clean `public` content.
- Sitemap is clean.
- Reader resume is stable with real imported titles.
- You know how much image storage the catalog needs.

Recommended VPS shape later:

- Node server and crawl worker as long-running services.
- PostgreSQL for catalog/queue.
- Persistent disk mounted as `IMPORT_ROOT`.
- Nginx or Caddy for HTTPS.
- Daily DB backup and image-folder backup.
- Disk/worker health monitoring.

## Verification Commands

Use the smallest relevant ladder:

```powershell
node --check public\app.js
npm test
```

HTTP smoke example on a temporary port:

```powershell
$env:PORT='54534'; npm run dev
```

Check:

- `/`
- `/api/series`
- `/sitemap.xml`
- `/chinh-sach-noi-dung`
- one public `/truyen/:slug`
- one public `/truyen/:slug/:chapterSlug`
- `/#/admin`
