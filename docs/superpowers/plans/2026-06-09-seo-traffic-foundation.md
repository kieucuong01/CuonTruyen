# SEO Traffic Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved Hướng A SEO foundation for Cuộn Truyện: stronger technical SEO, controlled traffic landing pages, and better internal discovery without creating thin spam pages.

**Architecture:** Keep SEO rendering centralized in `server/seo.mjs`, then reuse those helpers from the HTTP server and Vercel static export. Keep catalog filtering in existing `contentStore` functions and add only small pure helpers for SEO page selection and related links.

**Tech Stack:** Node ESM, vanilla server rendering, Vercel static export, `node:test`.

---

### Task 1: Lock SEO Behavior With Tests

**Files:**
- Modify: `tests/seo.test.mjs`

- [ ] Add failing tests for `WebSite` SearchAction JSON-LD on root pages.
- [ ] Add failing tests for breadcrumb JSON-LD on series and chapter pages.
- [ ] Add failing tests that controlled landing pages such as `/truyen-moi` and `/truyen-hot` are included in sitemap.
- [ ] Run `node --require ./tests/setup-env.cjs --test tests/seo.test.mjs` and confirm failure before implementation.

### Task 2: Centralize SEO Rendering

**Files:**
- Modify: `server/seo.mjs`
- Modify: `server/index.mjs`
- Modify: `scripts/write-public-config.mjs`

- [ ] Add helpers for site JSON-LD, breadcrumb JSON-LD, landing page config, landing page filtering, related series, and reusable series/chapter/tag renderers.
- [ ] Replace duplicated SEO shell rendering in `server/index.mjs` and `scripts/write-public-config.mjs` with the shared helpers.
- [ ] Keep existing URL contracts stable: `/truyen/:slug`, `/truyen/:slug/:chapter`, `/the-loai/:slug`, `/sitemap.xml`, `/robots.txt`.

### Task 3: Add Controlled Landing Pages

**Files:**
- Modify: `server/seo.mjs`
- Modify: `server/index.mjs`
- Modify: `scripts/write-public-config.mjs`
- Modify: `vercel.json`

- [ ] Add indexable pages for `/truyen-moi`, `/truyen-hot`, `/manhwa`, `/manhua`, `/truyen-tu-tien`, and `/truyen-chuyen-sinh`.
- [ ] Render meaningful headings, descriptions, and series lists from catalog data.
- [ ] Add landing pages to sitemap only when they can render useful content or are curated top-level entry pages.

### Task 4: Verify and Ship

**Files:**
- No new source files expected beyond docs/test/source updates.

- [ ] Run syntax checks for changed JS modules.
- [ ] Run targeted SEO tests, then full test suite.
- [ ] Run `npm run build:vercel` locally if DB is available.
- [ ] Commit, push branch, merge to main if needed, deploy production, and smoke check live metadata/sitemap.
