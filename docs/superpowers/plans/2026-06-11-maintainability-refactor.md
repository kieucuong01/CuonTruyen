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
- `public/routes/adminProductionView.mjs`: Pure admin production badge, pipeline-step, workflow progress, step progress, message, and icon helpers.
- `tests/adminProductionView.test.mjs`: Direct tests for admin production helper rendering, escaping, progress, message, and icon behavior.
- `server/adminProductionStatus.mjs`: Pure backend Production Health status builder for admin.
- `tests/adminProductionStatus.test.mjs`: Direct tests for Production Health status calculations.
- `public/routes/adminSeriesView.mjs`: Pure admin series card/detail stats and badge helpers.
- `tests/adminSeriesView.test.mjs`: Direct tests for admin series stats, status badges, asset badges, and source URL selection.
- `public/routes/adminTags.mjs`: Pure admin tag/origin picker, origin detection, and tag merge helpers.
- `tests/adminTags.test.mjs`: Direct tests for admin tag normalization, origin detection, merge behavior, and picker rendering.
- `public/routes/adminS3SyncView.mjs`: Pure admin S3 sync status rendering, failed-item list, stale-job warning, and retry-button visibility.
- `tests/adminS3SyncView.test.mjs`: Direct tests for S3 sync progress, failed item escaping, retry controls, and clock skew guidance.
- `public/routes/adminCrawlQueueView.mjs`: Pure admin crawl queue status rendering, running-job progress, waiting/failed job lists, and crawl ETA/rate formatting.
- `tests/adminCrawlQueueView.test.mjs`: Direct tests for crawl queue summaries, escaping, list limits, running-job metrics, and format helpers.
- `public/routes/adminImportProgressView.mjs`: Pure admin import/update progress status rendering, batch/chapter/image metrics, errors, and crawl speed formatting.
- `tests/adminImportProgressView.test.mjs`: Direct tests for import progress metrics, admin update status class, escaped errors, and usable-image fallbacks.

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

- [x] **Step 1: Write failing tests for pure production status rendering helpers**

Start with helpers currently embedded in `public/routes/admin.mjs`:

```text
productionStatusForSeries
productionStatusClass
productionStatusIcon
renderAdminProductionBadge
renderProductionPipelineStep
```

- [x] **Step 2: Extract only pure rendering/status helpers**

Do not move event binding or network calls in the first slice.

- [x] **Step 3: Verify admin route behavior**

Run:

```powershell
node --check public\routes\admin.mjs
node --require ./tests/setup-env.cjs --test tests\adminRouteSmoke.test.mjs tests\adminProductionView.test.mjs
```

## Task 3: Extract Backend Production Health Helpers

**Files:**
- Create: `server/adminProductionStatus.mjs`
- Create: `tests/adminProductionStatus.test.mjs`
- Modify: `server/index.mjs`
- Modify: `docs/agent-playbooks/agent-token-map.md`

- [x] **Step 1: Write failing tests for pure Production Health calculations**

Run:

```powershell
node --require ./tests/setup-env.cjs --test tests\adminProductionStatus.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/adminProductionStatus.mjs`.

- [x] **Step 2: Extract pure status helpers**

Move these helpers from `server/index.mjs` to `server/adminProductionStatus.mjs`:

```text
isImportAssetReference
productionStatusLabel
estimateProductionImageTotal
buildAdminProductionStatus
```

Keep file reads, cache, and `catalogStorageSummary()` ownership in `server/index.mjs`.

- [x] **Step 3: Verify server route behavior**

Run:

```powershell
node --check server\adminProductionStatus.mjs
node --check server\index.mjs
node --require ./tests/setup-env.cjs --test tests\adminProductionStatus.test.mjs tests\adminRouteSmoke.test.mjs tests\productionCheck.test.mjs tests\productionPipeline.test.mjs tests\storageConfig.test.mjs
```

## Task 4: Extract Admin Series View Helpers

**Files:**
- Create: `public/routes/adminSeriesView.mjs`
- Create: `tests/adminSeriesView.test.mjs`
- Modify: `public/routes/admin.mjs`
- Modify: `docs/agent-playbooks/agent-token-map.md`
- Modify: `docs/agent-playbooks/frontend-map.md`

- [x] **Step 1: Write failing tests for pure admin series helpers**

Run:

```powershell
node --require ./tests/setup-env.cjs --test tests\adminSeriesView.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `public/routes/adminSeriesView.mjs`.

- [x] **Step 2: Extract pure series display helpers**

Move these helpers from `public/routes/admin.mjs` to `public/routes/adminSeriesView.mjs`:

```text
adminSeriesStats
renderAdminSeriesBadges
renderAssetModeBadge
seriesUsesExternalImageUrls
assetStatusLabel
assetStatusClass
statusLabel
normalizeStatusClass
sourceUrlForAdminSeries
```

Keep route event binding, form submission, and chapter row rendering in `public/routes/admin.mjs`.

- [x] **Step 3: Verify admin route behavior**

Run:

```powershell
node --check public\routes\adminSeriesView.mjs
node --check public\routes\admin.mjs
node --require ./tests/setup-env.cjs --test tests\adminSeriesView.test.mjs tests\adminRouteSmoke.test.mjs
```

## Task 5: Extract Admin Tag And Origin Helpers

**Files:**
- Create: `public/routes/adminTags.mjs`
- Create: `tests/adminTags.test.mjs`
- Modify: `public/routes/admin.mjs`
- Modify: `docs/agent-playbooks/agent-token-map.md`
- Modify: `docs/agent-playbooks/frontend-map.md`

- [x] **Step 1: Write failing tests for pure tag/origin helpers**

Run:

```powershell
node --require ./tests/setup-env.cjs --test tests\adminTags.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `public/routes/adminTags.mjs`.

- [x] **Step 2: Extract pure tag/origin helpers**

Move these helpers from `public/routes/admin.mjs` to `public/routes/adminTags.mjs`:

```text
renderOriginTagPicker
getOriginTagOptions
getSeriesTagNames
getManualTagNames
mergeTagsWithOrigin
uniqueTagNames
detectOriginType
isOriginTagName
normalizeAdminTagName
```

Keep form submission and API persistence in `public/routes/admin.mjs`.

- [x] **Step 3: Verify admin route behavior**

Run:

```powershell
node --check public\routes\adminTags.mjs
node --check public\routes\admin.mjs
node --require ./tests/setup-env.cjs --test tests\adminTags.test.mjs tests\adminRouteSmoke.test.mjs
```

## Task 6: Extract Admin S3 Sync View Helpers

**Files:**
- Create: `public/routes/adminS3SyncView.mjs`
- Create: `tests/adminS3SyncView.test.mjs`
- Modify: `public/routes/admin.mjs`
- Modify: `docs/agent-playbooks/agent-token-map.md`
- Modify: `docs/agent-playbooks/frontend-map.md`

- [x] **Step 1: Write failing tests for pure S3 sync rendering helpers**

Run:

```powershell
node --require ./tests/setup-env.cjs --test tests\adminS3SyncView.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `public/routes/adminS3SyncView.mjs`.

- [x] **Step 2: Extract S3 sync status view helpers**

Move these helpers from `public/routes/admin.mjs` to `public/routes/adminS3SyncView.mjs`:

```text
renderS3FailedItems
S3 sync status class/markup calculation
```

Keep polling, retry API calls, and DOM event binding in `public/routes/admin.mjs`.

- [x] **Step 3: Verify admin route behavior**

Run:

```powershell
node --check public\routes\adminS3SyncView.mjs
node --check public\routes\admin.mjs
node --require ./tests/setup-env.cjs --test tests\adminS3SyncView.test.mjs tests\adminRouteSmoke.test.mjs
```

## Task 7: Extract Admin Crawl Queue View Helpers

**Files:**
- Create: `public/routes/adminCrawlQueueView.mjs`
- Create: `tests/adminCrawlQueueView.test.mjs`
- Modify: `public/routes/admin.mjs`
- Modify: `docs/agent-playbooks/agent-token-map.md`
- Modify: `docs/agent-playbooks/frontend-map.md`

- [x] **Step 1: Write failing tests for pure crawl queue rendering helpers**

Run:

```powershell
node --require ./tests/setup-env.cjs --test tests\adminCrawlQueueView.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `public/routes/adminCrawlQueueView.mjs`.

- [x] **Step 2: Extract crawl queue view helpers**

Move these helpers from `public/routes/admin.mjs` to `public/routes/adminCrawlQueueView.mjs`:

```text
renderCrawlQueueRunningJob
renderCrawlQueueWaitingList
crawl queue status class/markup calculation
formatCrawlDuration
formatCrawlRate
```

Keep polling, wake API calls, and DOM event binding in `public/routes/admin.mjs`.

- [x] **Step 3: Verify admin route behavior**

Run:

```powershell
node --check public\routes\adminCrawlQueueView.mjs
node --check public\routes\admin.mjs
node --require ./tests/setup-env.cjs --test tests\adminCrawlQueueView.test.mjs tests\adminRouteSmoke.test.mjs
```

## Task 8: Extract Admin Import Progress View Helpers

**Files:**
- Create: `public/routes/adminImportProgressView.mjs`
- Create: `tests/adminImportProgressView.test.mjs`
- Modify: `public/routes/admin.mjs`
- Modify: `docs/agent-playbooks/agent-token-map.md`
- Modify: `docs/agent-playbooks/frontend-map.md`

- [x] **Step 1: Write failing tests for pure import progress rendering**

Run:

```powershell
node --require ./tests/setup-env.cjs --test tests\adminImportProgressView.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `public/routes/adminImportProgressView.mjs`.

- [x] **Step 2: Extract import progress view helper**

Move the pure markup and metric calculation from `renderImportProgress()` in `public/routes/admin.mjs` to `renderImportProgressView()` in `public/routes/adminImportProgressView.mjs`.

Keep DOM target checks, polling, navigation on completion, and API calls in `public/routes/admin.mjs`.

- [x] **Step 3: Verify admin route behavior**

Run:

```powershell
node --check public\routes\adminImportProgressView.mjs
node --check public\routes\admin.mjs
node --require ./tests/setup-env.cjs --test tests\adminImportProgressView.test.mjs tests\adminRouteSmoke.test.mjs
```

## Task 9: Expand Admin Production View Helpers

**Files:**
- Modify: `public/routes/adminProductionView.mjs`
- Modify: `tests/adminProductionView.test.mjs`
- Modify: `public/routes/admin.mjs`
- Modify: `docs/agent-playbooks/frontend-map.md`
- Modify: `docs/superpowers/plans/2026-06-11-maintainability-refactor.md`

- [x] **Step 1: Write failing tests for production workflow progress helpers**

Run:

```powershell
node --require ./tests/setup-env.cjs --test tests\adminProductionView.test.mjs
```

Expected: FAIL because `adminProductionView.mjs` does not export `renderProductionProgressView`, `renderProductionStepProgress`, `productionJobMessage`, and `productionStepIcon`.

- [x] **Step 2: Move production progress view helpers**

Move these helpers from `public/routes/admin.mjs` to `public/routes/adminProductionView.mjs`:

```text
renderProductionProgress
renderProductionStepProgress
productionJobMessage
productionStepIcon
```

Keep production job polling, API calls, DOM target checks, and error handling in `public/routes/admin.mjs`; expose the moved markup as `renderProductionProgressView()`.

- [x] **Step 3: Verify admin route behavior**

Run:

```powershell
node --check public\routes\adminProductionView.mjs
node --check public\routes\admin.mjs
node --require ./tests/setup-env.cjs --test tests\adminProductionView.test.mjs tests\adminRouteSmoke.test.mjs
```
