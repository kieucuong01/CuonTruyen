# AI Agent Guide

This repo is a local-first comic reader and crawler prototype for Vietnamese manhua/manhwa content. The product priority is a fast continuous reader, reliable "Doc tiep" resume behavior, and crawl/admin flows that are easy to debug.

Use this file as the first stop for any future AI agent. Keep it short; put detailed workflows under `docs/agent-playbooks/`.

## Start Here

- Product and technical playbook: `docs/agent-playbooks/comic-reader.md`
- Frontend map for AI agents: `docs/agent-playbooks/frontend-map.md`
- Production-readiness playbook: `docs/agent-playbooks/production-readiness.md`
- Original implementation plan: `docs/superpowers/plans/2026-05-22-comic-reader-prototype.md`
- Original design spec: `docs/superpowers/specs/2026-05-22-korean-comic-reader-prototype-design.md`
- Main frontend: `public/app.js`
- Reader progress module: `public/readingProgress.mjs`
- Main server/API routes: `server/index.mjs`
- Catalog normalization, public/admin data shape, moderation: `server/contentStore.mjs`
- Crawl jobs and importer: `server/importJobs.mjs`, `server/importer.mjs`
- Source adapters: `server/adapters/`

## Commands

Run from the repo root:

```powershell
npm test
npm run dev
npm run worker:crawl
npm run smoke:import
```

The local server defaults to `http://localhost:4173`. In this desktop session the user commonly runs it on `http://localhost:54533` with:

```powershell
$env:PORT='54533'; npm run dev
```

## Current Architecture

- Node 18 ESM HTTP server, no framework.
- Static frontend in `public/`.
- Local JSON catalog and image cache under `data/imports/` by default.
- PostgreSQL catalog mode when `DATABASE_URL` or `POSTGRES_URL` is set.
- Separate crawl worker process for durable import jobs.
- Current preferred hosting mode before VPS: local machine runs crawler, API, and `/imports/*` image hosting.
- Browser reading history, follow list, and resume state in `localStorage`, with in-memory fallback for restricted storage.
- Public SEO routes under `/truyen/:seriesSlug`, `/truyen/:seriesSlug/:chapterSlug`, `/the-loai/:tagSlug`, static policy pages, `/sitemap.xml`, and `/robots.txt`.
- Admin/crawl/content review UI is in the SPA under `#/admin`.

## Important Product Behaviors

- Reader must scroll continuously across chapters without requiring "next chapter".
- Header/drawer must update the current chapter while scrolling.
- Home and series detail must make "Doc tiep" prominent and open the saved reading position.
- Chapter links must never depend on a fragile source slug only. Use stable `chapter.id` fallback.
- Import progress must show phase, chapter progress, image progress, retries/errors, and batch status for multiple URLs.
- Re-crawling the same running URL should reuse the active job, not start a duplicate.
- New imports default to `draft`; admin publishes intentionally.
- Public home/search/tag/reader/sitemap must only expose `public` series and `public` chapters.
- `draft` and `removed` content stays visible in admin for review/recovery.

## Editing Rules For Agents

- Do not delete or rewrite `data/imports/` unless the user explicitly asks. It can contain large local crawl output.
- Do not assume images should move to Supabase Storage. The current owner preference is local/VPS disk storage.
- Do not revert unrelated local changes. This workspace is often dirty.
- Prefer small patches that follow existing vanilla JS/Node patterns.
- Add tests for crawler parsing, progress/resume, URL normalization, catalog merge behavior, moderation, and sitemap filtering when changing those surfaces.
- After frontend behavior changes, verify on the exact local URL the user reports when browser tooling is available.
- If the user reports a broken URL, test both the API endpoint and the rendered browser route.

## Verification Checklist

Before saying a bug is fixed:

- `node --check public\app.js` if `public/app.js` changed.
- `npm test` for server/frontend logic tests.
- Browser or HTTP smoke check for the target route:
  - Page is not blank.
  - No "Server error" empty state.
  - Console has no relevant errors when browser tooling is available.
  - The intended interaction changes visible UI state.
  - Hidden/draft content does not leak to public routes or sitemap.

## Source And Policy Note

Only crawl sources the project owner is allowed to use. Keep source adapters modular and keep admin/manual unpublish or takedown controls available before production growth.
