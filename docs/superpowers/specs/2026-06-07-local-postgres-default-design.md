# Local Postgres Default Design

## Goal

Local development, admin, and crawler flows should use a local PostgreSQL
catalog by default so they follow the same storage path as production without
writing directly to the production database.

## Decisions

- Catalog storage is PostgreSQL for local and production.
- File-based catalog storage has been removed instead of kept as a fallback.
- PostgreSQL mode must fail early when no `CATALOG_DATABASE_URL`, `DATABASE_URL`,
  or `POSTGRES_URL` is configured.
- Tests load the local test database configuration and exercise the same
  database-backed code path as production.
- Local setup creates a private database named `comic_reader_local`, then runs
  schema setup.

## Data Flow

The local server and crawl worker load `.env.local`, resolve catalog storage,
verify that PostgreSQL mode has a connection URL, initialize the shared schema,
and then use the existing `server/dataStore.mjs` facade. Images continue to live
under `data/imports/` or `IMPORT_ROOT`; only catalog, crawl jobs, users,
bulletins, and analytics move through PostgreSQL.

## Error Handling

Missing DB configuration produces one direct error message that tells the
operator to run local setup. The app should not silently fall back to JSON.

## Verification

- Storage config tests cover the Postgres-only mode and the missing-URL failure.
- Script/docs checks cover the local setup command.
- Full `npm test` must pass against the database-backed storage path.
