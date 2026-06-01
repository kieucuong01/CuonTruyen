# Comic Reader Agent Playbook

This playbook is for future AI agents continuing work on this repo. The goal is to preserve the hard-won context: what matters to the product, where code lives, how to verify changes, and which bugs have already appeared.

## Product North Star

Build a Vietnamese comic site for manhua/manhwa that feels fast and smooth:

- The reader scrolls continuously from one chapter into the next.
- The home page highlights "Doc tiep" and opens the exact saved position.
- Crawler/admin flows show clear progress so the owner knows what was imported.
- The system is adapter-based so each source can be fixed independently.

For monetization, the likely direction is SEO traffic plus light display ads. Avoid UI choices that block reading or make the reader feel spammy.

## Current Stack

- Runtime: Node 18+ ESM.
- Server: `server/index.mjs`, built on `node:http`.
- Frontend: plain HTML/CSS/JS in `public/`.
- Tests: built-in `node:test`.
- Storage: local JSON/images under `data/imports/`, or PostgreSQL catalog mode when `DATABASE_URL` is set.
- Crawler execution: API enqueues durable jobs; `server/crawlWorker.mjs` runs them in a separate process.
- Hosting preference: the user's machine should handle crawling and stored images; Vercel can be frontend-only.
- No React/Vite in the current implementation, even though the earliest spec mentioned them.

## Key Files

| Area | File |
| --- | --- |
| SPA routes, home, reader, admin | `public/app.js` |
| Reader localStorage and resume logic | `public/readingProgress.mjs` |
| UI styling | `public/styles.css` |
| HTTP server and API routes | `server/index.mjs` |
| Catalog normalization/search/public shape | `server/contentStore.mjs` |
| JSON catalog and filesystem image helpers | `server/catalogStore.mjs` |
| Crawl orchestration | `server/importer.mjs` |
| Crawl job progress/dedup | `server/importJobs.mjs`, `server/crawlJobStore.mjs` |
| Crawl worker process | `server/crawlWorker.mjs` |
| Retry/rate limit helpers | `server/crawlRuntime.mjs` |
| Import URL and limit parsing | `server/importOptions.mjs` |
| Source adapters | `server/adapters/*.mjs` |

## Data Model Snapshot

The local catalog is `data/imports/catalog.json`. It contains:

- `series[]`
  - `id`, `title`, `slug`, `coverUrl`, `description`, `status`
  - `sourceMappings[]`
  - `tags[]`
  - `stats`
  - `crawlSchedule`
  - `chapters[]`
- `chapters[]`
  - `id`, `slug`, `label`, `title`, `url`, `status`
  - `imported`, `pageCount`
  - `pages[]`
- `pages[]`
  - `order`, `imageUrl`, `storageKey`, optional dimensions

`normalizeSeries()` and `normalizeChapter()` in `server/contentStore.mjs` are the public data gate. If old imported data is messy, fix normalization first instead of patching every UI caller.

## URL And Slug Rules

This has already caused real user-facing errors.

- Public series URL: `/truyen/:seriesSlug`
- Public chapter URL: `/truyen/:seriesSlug/:chapterSlug`
- Internal reader URL: `#/read/:seriesId`
- Chapter lookup must accept both `chapter.slug` and `chapter.id`.
- Frontend chapter links must use a helper that falls back to `chapter.id`.
- Treat bogus chapter slug values such as `series`, empty strings, or `undefined` as invalid.

Regression coverage lives in `tests/contentStore.test.mjs`.

## Reader Progress Rules

The "Doc tiep" feature is a core differentiator. Be careful here.

- Progress is saved per series via `public/readingProgress.mjs`.
- Save fields include `seriesId`, `chapterId`, `pageIndex`, `scrollY`, and `progressPercent`.
- While restoring old scroll, the app must not immediately overwrite saved progress with top-of-page state.
- On navigation away from the reader, call the flush/save path so progress is not lost.
- The current chapter label should update while scrolling, not only after chapter boundaries fully intersect.

Regression coverage lives in `tests/progress.test.mjs`.

## Crawl Rules

Admin can paste one or many URLs. Multi-URL support is implemented by parsing URLs from textarea input and creating a durable queued job per URL.

Important behavior:

- The API process must not run long crawls inline; run `npm run worker:crawl` separately.
- `maxChapters=0` means unlimited chapters.
- `maxPages=0` means unlimited pages.
- If the same URL is already running, reuse the active job.
- Crawling fewer chapters later must not delete previously imported chapters.
- Import progress should show phase, chapter count, image count, and errors.
- Image downloads use retry, and all fetches pass through per-domain rate limiting.
- Scheduled crawl scans are handled by the worker. Per-series `crawlSchedule.enabled` works by default; hot auto crawl requires `CRAWL_HOT_AUTO=true`.

Relevant tests:

- `tests/importOptions.test.mjs`
- `tests/importJobs.test.mjs`
- `tests/catalogMerge.test.mjs`
- adapter tests under `tests/*adapter*.mjs` and `tests/truyenqq.test.mjs`

## Adapter Rules

Each source adapter should expose:

- `fetchHtml(url)`
- `parseSeriesPage(html, seriesUrl)`
- `extractChapterImages(html, chapterUrl)`

Keep source-specific selectors and URL cleanup inside the adapter. Do not leak adapter quirks into the reader UI.

When fixing missing images:

1. Add or update a parser fixture test.
2. Confirm chapter image extraction returns all comic page images, not just the first few.
3. Keep deduping stable so repeated images are not rendered twice.

## API Routes

Public:

- `GET /api/series`
- `GET /api/public/home`
- `GET /api/search?q=...`
- `GET /api/tags/:tagSlug`
- `GET /api/series/:slug`
- `GET /api/series/:slug/chapters/:chapterSlug`
- `POST /api/events`

Admin/local:

- `POST /api/admin/import-jobs`
- `GET /api/admin/import-jobs/:id`
- `PATCH /api/admin/series/:id`
- `POST /api/admin/series/:id/crawl-schedule`

SEO/static:

- `/truyen/:seriesSlug`
- `/truyen/:seriesSlug/:chapterSlug`
- `/the-loai/:tagSlug`
- `/sitemap.xml`
- `/robots.txt`
- `/imports/*`

When `PUBLIC_IMPORTS_BASE_URL` is set, local `/imports/...` image paths are emitted as absolute URLs under that public base. This is for a Vercel frontend reading images from the user's local machine through a public tunnel/domain.
When `IMPORT_ROOT` is set, local catalog/image runtime files move from `data/imports/` to that disk path. Use this on a VPS with a larger mounted volume.

When the frontend is deployed away from the Node server, set `window.COMIC_READER_CONFIG.apiBaseUrl` in `public/index.html` so browser API calls go to the user's public local API host instead of the frontend origin.

## Common Debug Flow

When the user reports a broken chapter URL:

1. Test the exact API:

```powershell
$ProgressPreference='SilentlyContinue'
Invoke-WebRequest -UseBasicParsing -TimeoutSec 20 'http://localhost:54533/api/series/<seriesSlug>/chapters/<chapterSlug>'
```

2. Inspect matching series/chapter in `data/imports/catalog.json`.
3. Open the exact browser route the user gave.
4. Check for:
   - route empty state
   - `Server error` text
   - console errors
   - missing `chapter.slug` or bad `chapter.id`
5. Fix normalization/lookup first if the data is inconsistent.

## Verification Commands

Use the smallest set that matches the edit:

```powershell
node --check public\app.js
npm test
npm run worker:crawl
```

For server start on the user's current port:

```powershell
$env:PORT='54533'; npm run dev
```

If a previous server process is already listening, stop that PID first. Do not leave multiple dev servers on the same port.

## Browser QA Checklist

After frontend changes:

- Load `http://localhost:54533/`.
- Verify home renders and search input works.
- Click a series card.
- Click an imported chapter.
- Confirm reader appears, images render, and no `Server error` empty state appears.
- Scroll enough to update current chapter label.
- Go home and confirm "Doc tiep" opens the saved position.
- Check console errors/warnings.

For exact user reports, always use the exact URL they give.

## Known Gotchas

- `data/imports/catalog.json` can become large; avoid repeatedly fetching full `/api/series` while debugging if a narrower API call will work.
- Some crawled chapter labels are Vietnamese and may slugify poorly if encoding is bad.
- `slugify()` returns `series` as a default for unusable input, which is not safe as a chapter slug. `normalizeChapter()` handles this.
- Source sites may return 404 or block crawler requests even when the browser can view the page.
- The app currently uses local storage and local files; production needs persistent object storage/database.

## Production Migration Notes

The current owner-preferred production architecture is:

- Vercel for the public frontend, if desired.
- The user's own machine for crawler jobs, local catalog, and cached images.
- A stable HTTPS tunnel or reverse proxy for the local API/image host.
- Local `data/imports/` backups as the first storage safety net.

Do not move crawler jobs into short-lived frontend serverless functions unless the job is tiny. Long crawls need retries, durable progress, and a process that can keep running.

The production Supabase schema draft lives at `supabase/comic_reader_schema.sql`, but Supabase is optional later infrastructure. Apply it only to a dedicated comic-reader Supabase project, and do not move images to Supabase Storage unless the owner explicitly changes strategy.

Performance-oriented API contract:

- `GET /api/home` returns summary series only and must not include page arrays.
- `GET /api/series/:slug` returns metadata and chapter summaries only.
- `GET /api/series/:slug/chapters/:chapterSlug?window=1` returns current chapter pages plus the requested next window.
- `GET /api/series/:slug/chapters/:chapterSlug/next` returns the next readable chapter for continuous scroll.

## Content Safety

Do not hard-code claims that third-party comics are copyright-free. Build admin takedown/unpublish controls before production. The crawler should be used only with sources the project owner is allowed to operate with.
