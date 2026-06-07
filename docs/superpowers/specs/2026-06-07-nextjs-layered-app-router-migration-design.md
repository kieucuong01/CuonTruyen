# Next.js Layered App Router Migration Design

## Goal

Migrate the comic reader project toward Next.js App Router in layers so public SEO pages and first-load performance improve first, while preserving the current reader, admin, API, crawler, and production publish behavior during the transition.

## Approved Direction

Use Hướng A: layered migration.

1. Move public SEO routes first: `/`, `/truyen/:slug`, `/truyen/:slug/:chapter`, and `/the-loai/:slug`.
2. Turn the reader into a client island so continuous scroll, chapter tracking, and "Đọc tiếp" resume behavior remain browser-driven.
3. Migrate admin, API route handlers, and worker integration later.
4. Keep crawler, optimizer, S3 sync, and production publishing outside Vercel runtime.

## Current Constraints

- The current app is a vanilla ESM SPA served from `public/`.
- The current API is a custom Node HTTP server in `server/index.mjs`.
- Production currently uses Vercel for public hosting and lightweight API reads/admin content management.
- Catalog, users, events, crawl jobs, and admin content live in PostgreSQL.
- Vietnix S3 serves public image URLs under `/imports/*`.
- Local crawler and S3 sync are operationally separate from production public traffic.
- The working tree may contain unrelated local changes; migration work must avoid reverting them.

## Phase 1 Scope

Phase 1 creates a Next.js App Router surface for public SEO routes while keeping the existing SPA and API available as compatibility layers.

### In Scope

- Add Next.js, React, TypeScript, and minimal configuration.
- Add `src/app` routes for:
  - `/`
  - `/truyen/[seriesSlug]`
  - `/truyen/[seriesSlug]/[chapterSlug]`
  - `/the-loai/[tagSlug]`
- Add shared server data helpers that reuse existing catalog/content logic.
- Add route metadata using Next `generateMetadata`.
- Add server-rendered HTML for title, description, cover, tags, chapter list, and reader shell.
- Add a client reader island that can delegate to or port existing reader runtime gradually.
- Keep `/admin` on the old SPA compatibility path for now.
- Keep API endpoints backed by existing server code for now.
- Keep worker, crawler, image optimizer, S3 sync, and production publish scripts unchanged.

### Out Of Scope For Phase 1

- Full admin rewrite.
- Full API route handler rewrite.
- Removing `public/app.js`.
- Removing the current Node server.
- Moving crawler/worker execution to Vercel.
- Moving images to Supabase Storage.

## Target Route Behavior

### `/`

- Server-render the public home page with crawlable sections for popular and recently updated series.
- Include canonical metadata, Open Graph metadata, and useful description copy.
- Load "Đọc tiếp" from a small client island because reading history is stored in localStorage.

### `/truyen/[seriesSlug]`

- Server-render series title, cover, tags, description, status, and public chapters.
- Hide draft/removed series and chapters.
- Include canonical metadata and JSON-LD.
- Include a "Đọc tiếp" client island that reads saved progress and links to the saved chapter/position.

### `/truyen/[seriesSlug]/[chapterSlug]`

- Server-render reader shell, series title, chapter title, previous/next chapter hints, and initial page list for the requested public chapter.
- Use a client reader island for scroll restoration, localStorage progress, toolbar chapter tracking, lazy loading, and appending adjacent chapters.
- Use stable chapter ID fallback when a chapter slug is missing or fragile.

### `/the-loai/[tagSlug]`

- Server-render tag landing page with SEO copy from existing tag SEO helpers.
- Include only public readable series.
- Include canonical metadata and collection JSON-LD.

## Reader Island Requirements

- Preserve existing localStorage keys and saved-progress data shape unless a compatibility adapter is provided.
- Preserve "Đọc tiếp" behavior from home and series detail.
- Preserve continuous chapter scroll and toolbar/drawer current-chapter updates.
- Preserve reader image memory management behavior from `readerWindow` helpers.
- Avoid fixed aspect ratios unless source image dimensions are reliable.
- Fetch adjacent chapters through the existing reader APIs during Phase 1.

## SEO Requirements

- Public route HTML must be meaningful before hydration.
- `draft` and `removed` content must not appear in public HTML, metadata, sitemap, search, tag pages, or reader payloads.
- Canonical URLs must match current production URL structure.
- Metadata should include title, description, Open Graph, Twitter, and JSON-LD where existing helpers already support it.
- Existing `/sitemap.xml` and `/robots.txt` can stay on the current server path in Phase 1, but the plan must leave a clear path to Next metadata routes later.

## Performance Requirements

- Do not load admin code on public routes.
- Do not load the full old SPA router on Next-rendered public pages.
- Keep the reader client bundle route-scoped.
- Avoid serializing full catalog/page arrays to pages that do not need them.
- Reuse existing compact public data shapes from `contentStore`.
- Use server rendering for route-critical content and client islands only for browser-only state.

## Deployment Strategy

Phase 1 should support local development and testing without immediately removing the current Vercel static deployment path. After Phase 1 proves public Next routes work, a later phase can switch Vercel build/deploy fully to Next.

The migration branch should document both commands during the transition:

- Existing app: `npm run dev`
- Next app: `npm run dev:next`

The final migration will eventually make Next the default `npm run dev` and `npm run build`, but Phase 1 can keep both to reduce blast radius.

## Testing Strategy

- Add tests for server data helpers used by Next routes.
- Add metadata tests for series, chapter, tag, and home pages where practical.
- Keep existing domain tests passing.
- Run `npm run check:encoding` after Vietnamese text changes.
- Run route smoke checks for the Next public routes once the Next dev server is available.
- Verify old admin and crawler scripts still run or remain unchanged.

## Risks

- Next build can fail if Postgres clients initialize at module scope. Use lazy initialization and server-only helpers.
- The reader can regress if localStorage progress keys or chapter identity rules change.
- Running old SPA and Next side-by-side can create duplicated route ownership. Phase 1 must make ownership explicit.
- Large public static exports can mask whether server-rendered Next HTML is actually being served.
- Adding TypeScript and React can increase build complexity on Windows if scripts are not explicit.

## Success Criteria For Phase 1

- A Next.js App Router app exists in the repo.
- The Next dev server can render `/`, `/truyen/:slug`, `/truyen/:slug/:chapter`, and `/the-loai/:slug`.
- Rendered HTML for those routes includes meaningful SEO content without relying on the old SPA router.
- Reader route uses a client island and preserves initial compatibility with existing reader APIs.
- The old admin, API, worker, crawler, optimize, S3 sync, and production publish flows remain available.
- Existing tests still pass or have documented intentional migration updates.
- No crawler, optimizer, S3 sync, or production publish job is moved into Vercel Functions.
