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
- `public/routes/adminSeriesJobActions.mjs`: admin per-series update-chapters and refresh-image-urls job actions.
- `public/routes/adminProductionActions.mjs`: admin production publish, selected-step publish, production check, and production action button binding.
- `public/routes/adminBulletinActions.mjs`: admin bulletin submit, pin/unpin actions, status updates, and rerender hooks.
- `public/routes/adminRevenueActions.mjs`: admin revenue dashboard range binding, analytics refresh, and error insertion.
- `public/routes/adminImportActions.mjs`: admin crawl/import form submit flow, import job creation, polling, flash messages, and cache invalidation.
- `public/routes/adminDomHelpers.mjs`: admin cover image fallback, auth-error detection, and catalog series lookup.
- `public/routes/adminDataLoaders.mjs`: admin dashboard read endpoints and optional fallback loaders.
- `public/routes/adminSession.mjs`: admin token/email session storage with in-memory fallback.
- `public/routes/adminPanelPolling.mjs`: admin S3 sync and crawl queue panel polling, retry, and wake actions.
- `public/routes/adminJobPolling.mjs`: admin import/production job polling loops and status render adapters.
- `public/routes/adminJobHelpers.mjs`: pure admin job response normalization, flash-message helpers, result unwrapping, and production step parsing.
- `public/routes/adminPayloads.mjs`: pure admin import, series metadata, and chapter moderation payload builders.
- `public/routes/adminFeedbackView.mjs`: pure admin login shell, production check result, and API error feedback rendering.
- `public/routes/adminRevenueView.mjs`: pure admin revenue/analytics dashboard, metric formatting, range tabs, and top-series table rendering.
- `public/routes/adminShellView.mjs`: pure admin session bar, bulletin panel/message, production/local notices, storage notice, and local ops panel shell helpers.
- `public/routes/adminImportProgressView.mjs`: pure admin import/update progress status, batch/chapter/image metrics, errors, and crawl speed rendering.
- `public/routes/adminCrawlQueueView.mjs`: pure admin crawl queue status, running-job progress, waiting/failed job lists, and crawl ETA/rate format helpers.
- `public/routes/adminS3SyncView.mjs`: pure admin S3 sync status, failed-item list, stale-job warning, and retry-button rendering.
- `public/routes/adminTags.mjs`: pure admin tag/origin picker, origin detection, and tag merge helpers.
- `public/routes/adminSeriesView.mjs`: pure admin series stats, status badges, asset-mode badge, and source URL helpers.
- `public/routes/adminSeriesEditorView.mjs`: pure admin series card/detail editor, cover fallback, chapter rows, and production publish panel rendering.
- `public/routes/adminProductionView.mjs`: pure admin production badge, pipeline-step, workflow progress, step progress, and production message/icon helpers.

## Where to edit

- Home / Doc tiep shelf: start in `public/routes/home.mjs`.
- Series detail: `renderSeriesDetail()`, `renderSeriesContinueCard()`.
- Reader shell: `drawReader()`, `renderChapter()`, `attachReaderObservers()`.
- Reader progress: prefer editing `public/readerRestore.mjs`, `public/readerWindow.mjs`, or `public/readingProgress.mjs` before adding more logic to `public/app.js`.
- Admin CMS/crawl: start in `public/routes/admin.mjs`; for crawl/import form actions start in `public/routes/adminImportActions.mjs`; for per-series update/refresh actions start in `public/routes/adminSeriesJobActions.mjs`; for production publish/check actions start in `public/routes/adminProductionActions.mjs`; for bulletin submit/pin actions start in `public/routes/adminBulletinActions.mjs`; for revenue range refresh actions start in `public/routes/adminRevenueActions.mjs`; for S3/crawl queue panel polling start in `public/routes/adminPanelPolling.mjs`; for cover fallback/auth/catalog lookup start in `public/routes/adminDomHelpers.mjs`; for dashboard read endpoints start in `public/routes/adminDataLoaders.mjs`; for token/email session storage start in `public/routes/adminSession.mjs`; for import/production job polling start in `public/routes/adminJobPolling.mjs`; for job response/flash/step helper logic start in `public/routes/adminJobHelpers.mjs`; for import/save/chapter payload shape start in `public/routes/adminPayloads.mjs`; for login/error/check-result feedback start in `public/routes/adminFeedbackView.mjs`; for series card/detail editor markup start in `public/routes/adminSeriesEditorView.mjs`; for revenue/analytics dashboard rendering start in `public/routes/adminRevenueView.mjs`; for session/bulletin/storage/local-op panel shell rendering start in `public/routes/adminShellView.mjs`; for import/update progress rendering start in `public/routes/adminImportProgressView.mjs`; for crawl queue status rendering start in `public/routes/adminCrawlQueueView.mjs`; for S3 sync status rendering start in `public/routes/adminS3SyncView.mjs`; for tag/origin behavior start in `public/routes/adminTags.mjs`; for series stats/badges start in `public/routes/adminSeriesView.mjs`; for production badge/pipeline/progress rendering start in `public/routes/adminProductionView.mjs`.
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
3. Keep admin page composition in `public/routes/admin.mjs`, crawl/import form actions in `public/routes/adminImportActions.mjs`, per-series job actions in `public/routes/adminSeriesJobActions.mjs`, production publish/check actions in `public/routes/adminProductionActions.mjs`, bulletin submit/pin actions in `public/routes/adminBulletinActions.mjs`, revenue refresh actions in `public/routes/adminRevenueActions.mjs`, S3/crawl queue polling in `public/routes/adminPanelPolling.mjs`, DOM helpers in `public/routes/adminDomHelpers.mjs`, read endpoints in `public/routes/adminDataLoaders.mjs`, session storage in `public/routes/adminSession.mjs`, job polling in `public/routes/adminJobPolling.mjs`, job helpers in `public/routes/adminJobHelpers.mjs`, payload builders in `public/routes/adminPayloads.mjs`, feedback/login markup in `public/routes/adminFeedbackView.mjs`, series editor markup in `public/routes/adminSeriesEditorView.mjs`, revenue dashboard helpers in `public/routes/adminRevenueView.mjs`, shell helpers in `public/routes/adminShellView.mjs`, import progress helpers in `public/routes/adminImportProgressView.mjs`, crawl queue helpers in `public/routes/adminCrawlQueueView.mjs`, S3 sync view helpers in `public/routes/adminS3SyncView.mjs`, tag/origin helpers in `public/routes/adminTags.mjs`, series display helpers in `public/routes/adminSeriesView.mjs`, and production badge/pipeline/progress helpers in `public/routes/adminProductionView.mjs`.

Keep each split behavior-preserving and covered by existing tests or small module tests.
