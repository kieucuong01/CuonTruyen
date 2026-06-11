# Frontend Map For AI Agents

This file is a compact map for future agents. Read it before touching `public/app.js`.

## Rule zero


## Current frontend shape

The app is still a vanilla ESM SPA. The long-term goal is to split route renderers out of `public/app.js`, but do it incrementally.

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
- `public/routes/adminShellView.mjs`: pure admin session bar, bulletin panel/message, production/local notices, storage notice, and local ops panel shell helpers.
- `public/routes/adminImportProgressView.mjs`: pure admin import/update progress status, batch/chapter/image metrics, errors, and crawl speed rendering.
- `public/routes/adminCrawlQueueView.mjs`: pure admin crawl queue status, running-job progress, waiting/failed job lists, and crawl ETA/rate format helpers.
- `public/routes/adminS3SyncView.mjs`: pure admin S3 sync status, failed-item list, stale-job warning, and retry-button rendering.
- `public/routes/adminTags.mjs`: pure admin tag/origin picker, origin detection, and tag merge helpers.
- `public/routes/adminSeriesView.mjs`: pure admin series stats, status badges, asset-mode badge, and source URL helpers.
- `public/routes/adminProductionView.mjs`: pure admin production badge, pipeline-step, workflow progress, step progress, and production message/icon helpers.

## Where to edit

- Home / Doc tiep shelf: start in `public/routes/home.mjs`.
- Series detail: `renderSeriesDetail()`, `renderSeriesContinueCard()`.
- Reader shell: `drawReader()`, `renderChapter()`, `attachReaderObservers()`.
- Reader progress: prefer editing `public/readerRestore.mjs`, `public/readerWindow.mjs`, or `public/readingProgress.mjs` before adding more logic to `public/app.js`.
- Admin CMS/crawl: start in `public/routes/admin.mjs`; for session/bulletin/storage/local-op panel shell rendering start in `public/routes/adminShellView.mjs`; for import/update progress rendering start in `public/routes/adminImportProgressView.mjs`; for crawl queue status rendering start in `public/routes/adminCrawlQueueView.mjs`; for S3 sync status rendering start in `public/routes/adminS3SyncView.mjs`; for tag/origin behavior start in `public/routes/adminTags.mjs`; for series card/detail badges start in `public/routes/adminSeriesView.mjs`; for production badge/pipeline/progress rendering start in `public/routes/adminProductionView.mjs`.
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
3. Keep admin form/crawl changes isolated in `public/routes/admin.mjs`, shell helpers in `public/routes/adminShellView.mjs`, import progress helpers in `public/routes/adminImportProgressView.mjs`, crawl queue helpers in `public/routes/adminCrawlQueueView.mjs`, S3 sync view helpers in `public/routes/adminS3SyncView.mjs`, tag/origin helpers in `public/routes/adminTags.mjs`, series display helpers in `public/routes/adminSeriesView.mjs`, and production badge/pipeline/progress helpers in `public/routes/adminProductionView.mjs`.

Keep each split behavior-preserving and covered by existing tests or small module tests.
