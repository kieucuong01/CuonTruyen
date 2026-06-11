# Local PostgreSQL And pgAdmin4

This project now uses the PostgreSQL server installed on the Windows machine
for local catalog/admin/crawl data. pgAdmin4 can manage the same database that
the app reads and writes.

## Connection Details

Use this server in pgAdmin4:

```text
Name: CuonTruyen Local
Host: 127.0.0.1
Port: 5432
Maintenance database: comic_reader_local
Username: comic_user
Password: comic_local_password
```

The app should use:

```env
CATALOG_STORAGE=postgres
CATALOG_DATABASE_URL=postgres://comic_user:comic_local_password@127.0.0.1:5432/comic_reader_local
POSTGRES_SSL=false
```

Do not document or commit the local PostgreSQL superuser password.

## Data Ownership

PostgreSQL stores:

- `series`
- `chapters`
- `pages`
- `tags`
- `series_tags`
- `crawl_jobs`
- `app_users`
- `app_sessions`
- `analytics_events`
- `bulletin_messages`

Images are not stored in PostgreSQL. They stay on disk under:

```text
data/imports/
```

or the configured `IMPORT_ROOT`.

## Current Local Data Snapshot

After migrating from the old Docker database to the installed PostgreSQL
server, the local database contained:

```text
series=30
chapters=5630
pages=455659
crawl_jobs=1
analytics_events=8
```

Use these counts only as a rough sanity check. They will change as the catalog
is crawled and edited.

## Schema Setup

Run this after a fresh DB, after pulling migrations, or after restoring data:

```powershell
npm run db:setup:schema
```

The schema is assembled through `server/postgresStore.mjs` and migrations under
`migrations/`. The setup command is idempotent.

## Old Docker Database

The old Docker Postgres was exposed on:

```text
127.0.0.1:55432
```

That port is no longer the intended local database. If Docker Desktop is opened
and a container named `cuontruyen-local-postgres` starts again, stop it in Docker
Desktop unless you intentionally need the old DB for rollback.

Do not point `.env.local` back to `55432` unless explicitly doing a recovery.

## Useful Inspection Queries

Open Query Tool in pgAdmin4 and run:

```sql
select count(*) from series;
select count(*) from chapters;
select count(*) from pages;
select id, title, status, updated_at from series order by updated_at desc limit 20;
select job_id, status, phase, created_at, updated_at from crawl_jobs order by updated_at desc limit 20;
```

To see only public catalog content:

```sql
select id, title, slug
from series
where status = 'public'
order by updated_at desc;
```

## Common Failure Modes

- App says Postgres URL is missing: check `.env.local` has `CATALOG_DATABASE_URL`.
- App cannot connect on `5432`: check the Windows service `postgresql-x64-18`.
- pgAdmin shows empty tables: confirm it is connected to `127.0.0.1:5432`, not
  the old Docker port `55432`.
- Worker writes jobs but admin does not show them: server and worker are using
  different env files or different `CATALOG_DATABASE_URL` values.
