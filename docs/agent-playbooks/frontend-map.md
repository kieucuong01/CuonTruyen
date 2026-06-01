# Frontend Map For AI Agents

This file is a compact map for future agents. Read it before touching `public/app.js`.

## Rule zero

Do not rewrite `data/imports/`. Do not remove reader image release/restore behavior unless you are specifically fixing reader memory or scroll stability.

## Current frontend shape

The app is still a vanilla ESM SPA. The long-term goal is to split route renderers out of `public/app.js`, but do it incrementally.

Stable helper modules now include:

- `public/cacheStore.mjs`: bounded in-memory cache for API promises.
- `public/analyticsClient.mjs`: sends analytics events to `/api/events`.
- `public/readerRestore.mjs`: pure saved-scroll restore helpers.
- `public/readerWindow.mjs`: image release/restore and reader window helpers.
- `public/readingProgress.mjs`: localStorage progress and history.
- `public/monetization.mjs`: ad/donate visibility config.

## Where to edit

- Home / Doc tiep shelf: `renderHome()`, `renderContinueShelf()`, `renderContinueItem()`.
- Series detail: `renderSeriesDetail()`, `renderSeriesContinueCard()`.
- Reader shell: `drawReader()`, `renderChapter()`, `attachReaderObservers()`.
- Reader progress: prefer editing `public/readerRestore.mjs`, `public/readerWindow.mjs`, or `public/readingProgress.mjs` before adding more logic to `public/app.js`.
- Admin CMS/crawl: `renderAdmin()`, `renderAdminSeriesForm()`, `renderAdminChapterRow()`, and import job handlers.
- Ads/donate: `renderMonetizationPanel()`, `renderReaderAdBreak()`, and `public/analyticsClient.mjs`.

## Mobile reader safety checklist

- Images must remain visually continuous. Do not add inline `aspect-ratio` to reader page images unless image dimensions are proven accurate.
- Keep `releaseReaderImageElement()` preserving measured height before replacing old image sources.
- After frontend reader changes, check home -> series -> reader -> scroll -> home -> Doc tiep.
- If Vietnamese text changes, run `npm run check:encoding` before handing off.

## Next refactor direction

Split only one route surface at a time:

1. Move home render functions into `public/routes/home.mjs`.
2. Move reader render/runtime into `public/routes/reader.mjs` after reader restore helpers are stable.
3. Move admin render/forms into `public/routes/admin.mjs` last, because admin touches many API calls.

Keep each split behavior-preserving and covered by existing tests or small module tests.
