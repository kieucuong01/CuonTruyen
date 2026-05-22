# Comic Reader Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local comic reader website that imports a per-series URL, caches chapter images, reads continuously, and resumes the saved position.

**Architecture:** Use a dependency-light Node HTTP server that serves static frontend files and JSON APIs. Keep scraping/parsing in isolated adapter modules, local catalog persistence in one store module, and browser progress in frontend localStorage.

**Tech Stack:** Node 18 ESM, built-in `node:test`, static HTML/CSS/JS, local JSON/image cache under `data/imports/`.

---

## File Structure

- Create `package.json`: scripts for dev, test, and smoke import.
- Create `server/index.mjs`: local HTTP server, static file serving, and API routing.
- Create `server/catalogStore.mjs`: JSON catalog and filesystem cache helpers.
- Create `server/adapters/manhuarock.mjs`: URL normalization, series/chapter parsing, image extraction, and image downloading.
- Create `server/importer.mjs`: orchestration for importing a series URL.
- Create `server/utils.mjs`: slug, HTML entity, URL, and MIME helpers.
- Create `public/index.html`: app shell.
- Create `public/styles.css`: polished reader-focused interface.
- Create `public/app.js`: library/import UI, reader, chapter drawer, infinite chapter loading, progress persistence.
- Create `tests/adapter.test.mjs`: parser and URL behavior tests.
- Create `tests/progress.test.mjs`: progress payload behavior test.

## Tasks

### Task 1: Adapter and Progress Tests

**Files:**
- Create: `tests/adapter.test.mjs`
- Create: `tests/progress.test.mjs`

- [ ] Write tests for absolute URL resolution, series title/chapter parsing, chapter image parsing, and progress payload shape.
- [ ] Run `npm test` and confirm failure because implementation modules do not exist.

### Task 2: Server Import Core

**Files:**
- Create: `server/utils.mjs`
- Create: `server/catalogStore.mjs`
- Create: `server/adapters/manhuarock.mjs`
- Create: `server/importer.mjs`
- Create: `server/index.mjs`
- Create: `package.json`

- [ ] Implement utility helpers and adapter functions that satisfy parser tests.
- [ ] Implement local catalog persistence and cached image downloading.
- [ ] Implement API routes: `GET /api/series`, `GET /api/series/:id`, `POST /api/import`, and static `/imports/*`.
- [ ] Run `npm test` and confirm adapter/progress tests pass.

### Task 3: Frontend Reader App

**Files:**
- Create: `public/index.html`
- Create: `public/styles.css`
- Create: `public/app.js`

- [ ] Implement import/library screen with URL input, import status, existing imported series, and continue card.
- [ ] Implement reader route using hash state: `#/read/:seriesId`.
- [ ] Implement continuous chapter append using intersection observer.
- [ ] Implement chapter drawer, current chapter highlight, jump actions, and continue action.
- [ ] Implement throttled localStorage progress save and restore.

### Task 4: Verification

**Files:**
- Modify as needed from earlier tasks.

- [ ] Run `npm test`.
- [ ] Run a limited live import smoke test against the provided URL with a small chapter/page cap.
- [ ] Start the local server.
- [ ] Use the in-app browser to verify import UI, reader, drawer, scroll continuity, and saved progress.
- [ ] Commit the completed website.
