# AI Agent Guide

This repo is a local-first comic reader and crawler prototype for Vietnamese manhua/manhwa content. The product priority is a fast continuous reader, reliable "Doc tiep" resume behavior, and crawl/admin flows that are easy to debug.

Use this file as the first stop for any future AI agent. Keep it short; put detailed workflows under `docs/agent-playbooks/`.

## Start Here

- Token-efficient map for AI agents: `docs/agent-playbooks/agent-token-map.md`
- Current deployment/storage state: `docs/agent-playbooks/current-deployment.md`
- SEO launch checklist: `docs/agent-playbooks/seo-launch.md`
- Revenue tracking and ads: `docs/agent-playbooks/revenue-tracking.md`
- Main branch auto-deploy flow: `docs/agent-playbooks/git-main-auto-deploy.md`
- Vercel + Vietnix S3 publishing flow: `docs/agent-playbooks/vercel-s3-publishing.md`
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
npm run export:static-api
npm run sync:s3:dry-run
npm run sync:s3
npm run sync:s3:retry-failed
npm run smoke:import
```

The local server defaults to `http://localhost:4173`. In this desktop session the user commonly runs it on `http://localhost:54533` with:

```powershell
$env:PORT='54533'; npm run dev
```

## Current Architecture

- Node 18 ESM HTTP server, no framework.
- Static frontend in `public/`.
- DB-first catalog facade; local and production default to PostgreSQL, and `CATALOG_DATABASE_URL`, `DATABASE_URL`, or `POSTGRES_URL` is required unless `CATALOG_STORAGE=json` is set explicitly.
- Local JSON under `data/imports/catalog.json` remains only as a deliberate legacy fallback/escape hatch; image cache still lives under `data/imports/`.
- Separate crawl worker process for durable import jobs.
- Current preferred public hosting mode: Vercel serves the frontend plus lightweight Node API for public reads/admin content management, Supabase Postgres stores catalog/users/events, Vietnix S3 serves `/imports/*` images, and the local machine runs crawler/optimizer/S3 sync.
- Browser reading history, follow list, and resume state in `localStorage`, with in-memory fallback for restricted storage.
- Public SEO routes under `/truyen/:seriesSlug`, `/truyen/:seriesSlug/:chapterSlug`, `/the-loai/:tagSlug`, static policy pages, `/sitemap.xml`, and `/robots.txt`.
- Admin/content review UI is in the SPA under `/admin`. Production admin is content-only; crawl/optimize/S3 sync controls are shown only on localhost or when `ENABLE_LOCAL_CRAWLER_UI=true`.

## Important Product Behaviors

- Reader must scroll continuously across chapters without requiring "next chapter".
- Header/drawer must update the current chapter while scrolling.
- Home and series detail must make "Doc tiep" prominent and open the saved reading position.
- Chapter links must never depend on a fragile source slug only. Use stable `chapter.id` fallback.
- Import progress must show phase, chapter progress, image progress, retries/errors, and batch status for multiple URLs.
- Re-crawling the same running URL should reuse the active job, not start a duplicate.
- New imports currently default to `public` when imported pages exist; admin can move content back to `draft`/`removed` intentionally.
- Public home/search/tag/reader/sitemap must only expose `public` series and `public` chapters.
- `draft` and `removed` content stays visible in admin for review/recovery.

## Editing Rules For Agents

- Do not delete or rewrite `data/imports/` unless the user explicitly asks. It can contain large local crawl output.
- Do not run full image S3 sync by default. Use `node scripts/sync-vietnix-s3.mjs --images-only --catalog-only --series-id <series-id> --apply` for normal image publish, `npm run sync:s3:retry-failed` for missing failed files, and only use `--all` when the owner explicitly wants a full image sync.
- Do not commit `.env`, `.env.local`, S3 credentials, Vercel project metadata, logs, `.runtime/`, or `data/imports/`.
- Do not assume images should move to Supabase Storage. The current owner preference is Vietnix S3 Object Storage for public images, with local crawl/admin.
- Do not revert unrelated local changes. This workspace is often dirty.
- Prefer small patches that follow existing vanilla JS/Node patterns.
- Add tests for crawler parsing, progress/resume, URL normalization, catalog merge behavior, moderation, and sitemap filtering when changing those surfaces.
- After frontend behavior changes, verify on the exact local URL the user reports when browser tooling is available.
- If the user reports a broken URL, test both the API endpoint and the rendered browser route.
- For public Vercel issues, check `public/config.js`, DB-backed API behavior, `STATIC_API_BASE_URL`, and S3 public JSON fallback before changing app logic.

## Verification Checklist

Before saying a bug is fixed:

- `node --check public\app.js` if `public/app.js` changed.
- `node --check public\routes\home.mjs` or `public\routes\admin.mjs` if those route modules changed.
- `npm test` for server/frontend logic tests.
- `npm run export:static-api` after changing public catalog or static API export logic.
- `npm run sync:s3:dry-run` before a real S3 sync.
- Browser or HTTP smoke check for the target route:
  - Page is not blank.
  - No "Server error" empty state.
  - Console has no relevant errors when browser tooling is available.
  - The intended interaction changes visible UI state.
  - Hidden/draft content does not leak to public routes or sitemap.

## Source And Policy Note

Only crawl sources the project owner is allowed to use. Keep source adapters modular and keep admin/manual unpublish or takedown controls available before production growth.
