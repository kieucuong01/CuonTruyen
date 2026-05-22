# Korean Comic Reader Prototype Design

## Goal

Build a fast prototype website for reading Korean/manhua-style comics from a per-series URL. The core experience is a focused continuous reader: the user scrolls from one chapter into the next without pressing a next-chapter button, and the app remembers the exact reading position so "Continue reading" returns to the right point.

The prototype will support crawler-based importing for sources the project owner confirms are allowed to use. The initial target URL for adapter research is:

- `https://manhuarock4.site/truyen-tranh/vua-choi-da-co-tai-khoan-vuong-gia.html`

## Product Scope

Version 1 is a local prototype, not a public production library.

Included:

- Home/import screen with a URL input and imported series list.
- Import flow that fetches a series page, extracts title, cover if available, chapter links, and chapter image URLs.
- Local cache for imported metadata and images so the reader loads quickly after import.
- Reader layout option A: dark, focused, image-first reading surface.
- Floating compact controls: back, continue/progress, and chapter drawer.
- Chapter drawer showing the current chapter, total chapter list, read progress, and jump-to-chapter actions.
- Continuous chapter loading with lazy image rendering and automatic next-chapter append near the bottom.
- Reading-position persistence in browser storage.

Excluded for v1:

- User accounts.
- Payment, comments, ratings, social features.
- Multi-source public catalog crawling.
- SEO pages for each comic.
- Production deployment or database.

## UX Design

The reader uses a dark, low-distraction canvas. Comic pages are centered with a readable max width and minimal gaps. A small floating button opens a drawer instead of keeping a permanent sidebar visible.

The drawer contains:

- Series title.
- Current chapter highlight.
- Chapter list in source order, with the currently visible chapter pinned/highlighted.
- Per-chapter loaded/read status.
- A "Continue reading" action.

The first screen should be the product itself, not a marketing landing page. The prototype opens to the import/library view. If a saved reading position exists, a clear "Continue reading" control appears near the top.

## Data Flow

The app has three local layers:

1. Source adapter
   - Accepts a series URL.
   - Downloads public HTML.
   - Parses metadata and chapter links.
   - Downloads chapter pages and extracts image URLs.
   - Downloads images into the local app cache for faster reading.

2. Local catalog
   - Stores imported series metadata, chapters, page image paths, and import timestamps.
   - Uses JSON files for the prototype to keep setup light.

3. Browser reading state
   - Stores current `seriesId`, `chapterId`, page index, and scroll offset in `localStorage`.
   - Updates while scrolling with throttling.
   - Restores on "Continue reading".

## Technical Shape

Use React + Vite for the frontend prototype. Use a small Node/Express local API for importing and serving cached comic data and images.

Suggested structure:

- `src/` for React UI.
- `src/components/Reader.tsx` for reader composition.
- `src/components/ChapterDrawer.tsx` for the drawer.
- `src/lib/readingProgress.ts` for localStorage state.
- `server/` for the local import API.
- `server/adapters/manhuarock.ts` for the initial source adapter.
- `data/imports/` for local cached metadata and images.

The source adapter is intentionally isolated so a future source can be added without changing the reader UI.

## Performance Design

Reader performance matters more than catalog complexity.

- Use lazy-loaded images with reserved width/height where possible to reduce layout shift.
- Append the next chapter before the reader reaches the bottom.
- Keep only a small window of chapter metadata active in React state.
- Persist progress with a throttled scroll listener.
- Avoid heavy animation while reading.
- Cache downloaded images locally for repeat reads.

## Error Handling

Importer errors should be visible and recoverable:

- Invalid URL: show a clear error.
- Source parser failure: show that the source layout may have changed.
- Image download failure: keep the chapter, mark failed pages, and allow retry import.
- Network failure: stop import safely and keep already downloaded data.

The reader should handle missing pages with an inline retry placeholder instead of crashing.

## Verification

Implementation should verify:

- Importing the provided series URL reaches metadata and at least one chapter image when source access allows it.
- Reader can open imported content.
- Scrolling near the end appends the next chapter.
- Chapter drawer highlights the currently visible chapter.
- "Continue reading" returns to the stored position after refresh.
- Desktop and mobile layouts do not overlap or clip controls.

## Policy And Source Use

The importer is intended for sources the project owner has rights or permission to use. The prototype should not hard-code claims that the imported material is free of copyright. The app should keep the adapter modular so permitted sources can replace the initial research target if needed.
