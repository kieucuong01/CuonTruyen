# Frontend Map For AI Agents

This file is a compact map for future agents. Read it before touching the
Next public/admin surface or the legacy local SPA.

## Rule zero


## Current frontend shape

Production public/admin routes are now Next.js App Router first. The vanilla
ESM SPA under `public/` remains as a local compatibility surface for the
Node admin/crawler workflow and is excluded from Vercel deploy uploads.

Stable helper modules now include:

- `public/cacheStore.mjs`: bounded in-memory cache for API promises.
- `public/analyticsClient.mjs`: sends analytics events to `/api/events`.
- `public/runtimeConfig.mjs`: reads `window.COMIC_READER_CONFIG`.
- `public/readerRestore.mjs`: pure saved-scroll restore helpers.
- `public/readerWindow.mjs`: image release/restore and reader window helpers.
- `public/readingProgress.mjs`: localStorage progress and history.
- `public/monetization.mjs`: ad/donate visibility config.
- `public/routes/home.mjs`: mobile-first home renderer and search/continue shelf UI.
- `public/routes/admin.mjs`: admin CMS, series detail management, import/update chapter jobs.

## Where to edit

- Public SEO home, series, reader entry, tags, policy pages, sitemap, robots:
  start in `src/app`.
- Public App Router data helpers: start in `src/lib/server/public-data.mjs` and
  `src/lib/server/public-api.mjs`.
- Public JSON cache helper: `src/lib/server/api-response.ts`; use
  `publicJsonApi()` only for public read data that is safe to share across
  users.
- Next reader client island: start in `src/components/reader/ReaderIsland.tsx`
  and `src/components/reader/readerState.mjs`.
- Next admin content dashboard/editor: start in `src/components/admin/`.
- App Router user/auth/bulletin/events/admin APIs: start in `src/app/api`.
- Next App Router internal navigation should use `next/link` rather than raw
  `<a>` so route transitions can prefetch and avoid full page reloads.
- Local-only crawler/import/S3/publish UI: keep in `public/routes/admin.mjs`
  and local `server/index.mjs`.

- Legacy local home / Doc tiep shelf: start in `public/routes/home.mjs`.
- Series detail: `renderSeriesDetail()`, `renderSeriesContinueCard()`.
- Reader shell: `drawReader()`, `renderChapter()`, `attachReaderObservers()`.
- Reader progress: prefer editing `public/readerRestore.mjs`, `public/readerWindow.mjs`, or `public/readingProgress.mjs` before adding more logic to `public/app.js`.
- Admin CMS/crawl: start in `public/routes/admin.mjs`.
- Ads/donate: `renderMonetizationPanel()`, `renderReaderAdBreak()`, and `public/analyticsClient.mjs`.

## Mobile reader safety checklist

- Images must remain visually continuous. Do not add inline `aspect-ratio` to reader page images unless image dimensions are proven accurate.
- Keep `releaseReaderImageElement()` preserving measured height before replacing old image sources.
- After frontend reader changes, check home -> series -> reader -> scroll -> home -> Doc tiep.
- If Vietnamese text changes, run `npm run check:encoding` before handing off.

## Next refactor direction

Migrate only one route surface at a time:

1. Keep public SEO and public read APIs in App Router.
2. Keep reader browser behavior in small client islands.
3. Move admin/API surfaces to App Router only when they do not start crawler,
   S3 sync, optimizer, worker, or production publish jobs on Vercel.

Keep each migration behavior-preserving and covered by existing tests or small
module tests.

## Next.js migration layer

Phase 1 public SEO routes live under `src/app`. Keep public server-rendered
content there and keep browser-only resume/reader behavior in client islands
under `src/components`.

Do not import admin or crawler UI into public Next routes.

`/admin` is now a route-scoped Next client island at
`src/components/admin/AdminDashboardIsland.tsx`. It handles login, catalog
overview, analytics summary, and bulletin readout without loading `/app.js` or
`/config.js`.

`/admin/series/:id` is now `src/components/admin/AdminSeriesEditorIsland.tsx`.
It handles metadata, status, chapter moderation, and crawl-schedule metadata
with App Router APIs. It intentionally does not render update-chapter,
import-job, S3 sync, production-check, or publish controls.

Public read API wrappers for the Next layer live under `src/app/api` and call
`src/lib/server/public-api.mjs`. They stay `force-dynamic` so builds do not need
a live catalog DB, but successful public responses use 300-second CDN cache
headers; errors and 404s remain no-store. App Router also owns short request
APIs for user auth, Google auth callbacks, bulletin messages, admin session,
admin-bulletin messages, `/api/events`, admin catalog/editor endpoints, chapter
moderation, crawl-schedule metadata, and admin analytics/events. Keep those
private/mutation/event routes dynamic/no-store.

For App Router public data, keep catalog routes light: home, series detail, and
tag pages should read catalog data with `includePages: false`; only reader
payloads should request chapter page arrays. Public App Router pages should use
the `cachedNextPublic*` helpers from `src/lib/server/public-data.mjs` so
`generateMetadata()` and the page render can share the same request-level data
lookup.

The home `ContinueIsland` should stay payload-light: do not serialize a full
series/chapter index into `/`. It reads the saved series id from localStorage
and fetches only that public series through the cached `/api/series` route.

Public listing grids should keep `SeriesCard` cover images lazy by default and
set `priority` only for the first two above-the-fold cards on home/tag routes.
Root layout should keep `preconnect` and `dns-prefetch` pointed at the public
imports origin from `PUBLIC_IMPORTS_BASE_URL` so S3-hosted covers/pages start
the connection early.

Reader pages intentionally keep raw `<img>` tags inside
`src/components/reader/ReaderIsland.tsx` so continuous scrolling, measured
image release/restore, and resume behavior remain predictable. Keep the first
reader image `fetchPriority="high"` and the first two reader images eager, but
do not convert reader pages to `next/image`.

Links that enter the reader (`Đọc từ đầu`, chapter list items, and `Đọc tiếp`)
should use `prefetch={false}`. Reader routes can include chapter page arrays,
so automatic prefetching can move heavy payloads onto the series/home page
before the reader is opened.

Public SEO pages render route-scoped JSON-LD with
`src/components/seo/JsonLd.tsx` and `src/lib/server/next-json-ld.mjs`.
Keep those payloads compact: series/chapter/tag/home schema should expose
canonical URLs, public names, small item lists, and breadcrumbs, not full page
arrays.

App Router owns the custom public 404 at `src/app/not-found.tsx`. Keep it
server-rendered, useful to readers, and `noindex` so hidden/missing content does
not become an indexable thin page.

Crawler/import controls, S3 sync, production pipeline, production checks, and
worker controls still run in the local Node app. On Vercel, matching App Router
API routes return production-safe `503` responses instead of starting jobs.
Do not move long crawl jobs into Vercel route handlers.
