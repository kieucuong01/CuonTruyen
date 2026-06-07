# Local Postgres Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local runtime use a separate local PostgreSQL database by default.

**Architecture:** Keep the existing `dataStore` facade and Postgres schema, but
change storage resolution so PostgreSQL is the default and JSON is explicit.
Add a Docker-based local setup path and keep tests on explicit JSON mode.

**Tech Stack:** Node ESM, node:test, PowerShell, Docker Compose, PostgreSQL.

---

### Task 1: Storage Mode Behavior

**Files:**
- Modify: `server/storageConfig.mjs`
- Modify: `tests/storageConfig.test.mjs`
- Create: `tests/setup-env.cjs`
- Modify: `package.json`

- [ ] Add failing tests for default PostgreSQL and missing DB URL errors.
- [ ] Add `assertCatalogStorageReady()` to centralize validation.
- [ ] Update `npm test` to load the explicit JSON test override.
- [ ] Run the focused storage config test.

### Task 2: Local Setup

**Files:**
- Create: `docker-compose.local.yml`
- Create: `ops/setup-local-postgres.ps1`
- Modify: `.env.example`
- Update local `.env.local` without committing it.

- [ ] Add a local PostgreSQL Compose service.
- [ ] Add a PowerShell setup script that starts the DB, updates catalog env
  values, waits for readiness, and runs `npm run db:migrate:catalog`.
- [ ] Add `db:local:setup` to `package.json`.

### Task 3: Runtime And Docs

**Files:**
- Modify: `server/index.mjs`
- Modify: `server/crawlWorker.mjs`
- Modify: `scripts/migrate-catalog-to-postgres.mjs`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/agent-playbooks/current-deployment.md`
- Modify: `docs/agent-playbooks/vercel-s3-publishing.md`

- [ ] Validate storage readiness before server/worker/migration startup.
- [ ] Update docs to say local uses a separate Postgres DB by default.
- [ ] Run syntax checks and full tests.
