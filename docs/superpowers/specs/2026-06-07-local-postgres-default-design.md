# Local Postgres Default Design

## Goal

Local development, admin, and crawler flows should use a local PostgreSQL
catalog by default so they follow the same storage path as production without
writing directly to the production database.

## Decisions

- Default catalog storage is PostgreSQL when no explicit storage mode is set.
- `CATALOG_STORAGE=json` remains the only legacy JSON escape hatch.
- PostgreSQL mode must fail early when no `CATALOG_DATABASE_URL`, `DATABASE_URL`,
  or `POSTGRES_URL` is configured.
- Tests run with an explicit JSON storage override so the suite stays fast and
  does not require a local database.
- Local setup uses Docker Compose for a private database named
  `comic_reader_local`, then runs the existing JSON-to-Postgres migration.

## Data Flow

The local server and crawl worker load `.env.local`, resolve catalog storage,
verify that PostgreSQL mode has a connection URL, initialize the shared schema,
and then use the existing `server/dataStore.mjs` facade. Images continue to live
under `data/imports/` or `IMPORT_ROOT`; only catalog, crawl jobs, users,
bulletins, and analytics move through PostgreSQL.

## Error Handling

Missing DB configuration in PostgreSQL mode produces one direct error message
that tells the operator to run local setup or explicitly opt into
`CATALOG_STORAGE=json`. The app should not silently fall back to JSON.

## Verification

- Storage config tests cover the default Postgres mode, the JSON escape hatch,
  and the missing-URL failure.
- Script/docs checks cover the local setup command and Docker Compose defaults.
- Full `npm test` must pass with the test-only JSON override.
