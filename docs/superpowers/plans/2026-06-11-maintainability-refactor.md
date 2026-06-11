# Maintainability Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the comic reader codebase easier for maintainers and AI agents to navigate by extracting focused helper modules from the largest orchestration files.

**Architecture:** Keep public APIs backward-compatible while moving pure logic into small modules with direct tests. Each slice should leave the app shippable and preserve existing import, admin, reader, and production behavior.

**Tech Stack:** Node 18 ESM, `node:test`, vanilla browser modules, PostgreSQL-backed catalog.

---

## File Structure

- `server/importChapterSelection.mjs`: Pure source/series/chapter identity and selection helpers for full import, new-chapter import, and refresh-image-url import.
- `server/importer.mjs`: Import orchestration, fetching, image handling, thumbnail creation, and CLI entrypoint. Re-export migrated helpers temporarily for compatibility.
- `tests/importChapterSelection.test.mjs`: Direct module boundary tests for chapter selection helpers.
- `tests/importerIdentity.test.mjs`: Existing mirror/source mapping tests, migrated to the focused helper module.
- `tests/importerIncremental.test.mjs`: Existing incremental/refresh behavior tests, migrated to the focused helper module where appropriate.
- `docs/agent-playbooks/agent-token-map.md`: Agent entrypoint map updated when responsibility moves.

## Task 1: Extract Import Chapter Selection Helpers

**Files:**
- Create: `server/importChapterSelection.mjs`
- Create: `tests/importChapterSelection.test.mjs`
- Modify: `server/importer.mjs`
- Modify: `tests/importerIdentity.test.mjs`
- Modify: `tests/importerIncremental.test.mjs`
- Modify: `docs/agent-playbooks/agent-token-map.md`

- [x] **Step 1: Write the failing module boundary test**

Run:

```powershell
node --require ./tests/setup-env.cjs --test tests\importChapterSelection.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/importChapterSelection.mjs`.

- [x] **Step 2: Move pure helpers into the new module**

Move these helpers from `server/importer.mjs` to `server/importChapterSelection.mjs`:

```text
sourceIdentityKey
sourceMappingsWith
findExistingSeriesForImport
selectNewChaptersForImport
selectRefreshImageUrlChapters
```

Keep private helper functions in the new module:

```text
chapterKeys
chapterSourceUrl
findExistingChapterForParsed
```

- [x] **Step 3: Keep importer compatibility**

`server/importer.mjs` must import the moved helpers for internal use and re-export them so older callers keep working during the transition.

- [x] **Step 4: Move helper tests to the focused module**

Update existing tests that directly exercise source/chapter selection helpers to import from `server/importChapterSelection.mjs`.

- [x] **Step 5: Verify the slice**

Run:

```powershell
node --check server\importChapterSelection.mjs
node --check server\importer.mjs
node --require ./tests/setup-env.cjs --test tests\importChapterSelection.test.mjs tests\importerIdentity.test.mjs tests\importerIncremental.test.mjs
npm test
```

Expected: all checks pass.

## Task 2: Next Candidate - Admin Production Helpers

**Files:**
- Create: `public/routes/adminProductionView.mjs`
- Create: `tests/adminProductionView.test.mjs`
- Modify: `public/routes/admin.mjs`

- [ ] **Step 1: Write failing tests for pure production status rendering helpers**

Start with helpers currently embedded in `public/routes/admin.mjs`:

```text
productionStatusForSeries
productionStatusClass
productionStatusIcon
renderAdminProductionBadge
renderProductionPipelineStep
```

- [ ] **Step 2: Extract only pure rendering/status helpers**

Do not move event binding or network calls in the first slice.

- [ ] **Step 3: Verify admin route behavior**

Run:

```powershell
node --check public\routes\admin.mjs
node --require ./tests/setup-env.cjs --test tests\adminRouteSmoke.test.mjs tests\adminProductionView.test.mjs
```
