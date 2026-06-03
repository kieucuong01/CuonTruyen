# Frontend Map For AI Agents

This file is a compact map for future agents. Read it before touching `public/app.js`.

## Rule zero

Do not rewrite `data/imports/`. Do not remove reader image release/restore behavior unless you are specifically fixing reader memory or scroll stability. For public Vercel issues, check `public/config.js` and the S3 static API before changing frontend route logic.

## Current frontend shape

The app is still a vanilla ESM SPA. The long-term goal is to split route renderers out of `public/app.js`, but do it incrementally.

Stable helper modules now include:

- `public/cacheStore.mjs`: bounded in-memory cache for API promises.
- `public/analyticsClient.mjs`: sends analytics events to `/api/events`.
- `public/apiClient.mjs`: routes API calls to same-origin backend, public backend, or S3 static API mode.
- `public/runtimeConfig.mjs`: reads `window.COMIC_READER_CONFIG`.
- `public/readerRestore.mjs`: pure saved-scroll restore helpers.
- `public/readerWindow.mjs`: image release/restore and reader window helpers.
- `public/readingProgress.mjs`: localStorage progress and history.
- `public/monetization.mjs`: ad/donate visibility config.
- `public/routes/home.mjs`: mobile-first home renderer and search/continue shelf UI.
- `public/routes/admin.mjs`: admin CMS, series detail management, import/update chapter jobs.

## Where to edit

- Home / Doc tiep shelf: start in `public/routes/home.mjs`.
- Series detail: `renderSeriesDetail()`, `renderSeriesContinueCard()`.
- Reader shell: `drawReader()`, `renderChapter()`, `attachReaderObservers()`.
- Reader progress: prefer editing `public/readerRestore.mjs`, `public/readerWindow.mjs`, or `public/readingProgress.mjs` before adding more logic to `public/app.js`.
- Admin CMS/crawl: start in `public/routes/admin.mjs`.
- Static API/Vercel mode: `public/apiClient.mjs`, `public/config.js`, `scripts/write-public-config.mjs`, `scripts/export-static-api.mjs`.
- Ads/donate: `renderMonetizationPanel()`, `renderReaderAdBreak()`, and `public/analyticsClient.mjs`.

## Mobile reader safety checklist

- Images must remain visually continuous. Do not add inline `aspect-ratio` to reader page images unless image dimensions are proven accurate.
- Keep `releaseReaderImageElement()` preserving measured height before replacing old image sources.
- After frontend reader changes, check home -> series -> reader -> scroll -> home -> Doc tiep.
- If Vietnamese text changes, run `npm run check:encoding` before handing off.

## Next refactor direction

Split only one route surface at a time:

1. Keep polishing `public/routes/home.mjs` for mobile home.
2. Move reader render/runtime into `public/routes/reader.mjs` after reader restore helpers are stable.
3. Keep admin form/crawl changes isolated in `public/routes/admin.mjs`.

Keep each split behavior-preserving and covered by existing tests or small module tests.
