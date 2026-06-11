# Token-Efficient Agent Map

Use this file first when another AI agent enters the repo. The goal is to avoid reading the whole project or the huge `data/imports/` tree.

## First Five Files

Read these before broad searches:

```text
AGENTS.md
docs/agent-playbooks/new-developer-onboarding.md
docs/agent-playbooks/current-deployment.md
docs/agent-playbooks/local-postgres-pgadmin.md
docs/agent-playbooks/frontend-map.md
docs/agent-playbooks/vercel-s3-publishing.md
package.json
```

Only read `README.md` if the task is onboarding, documentation, or broad architecture.

## Do Not Read By Default

Avoid opening or recursively listing:

```text
data/imports/
logs/
.runtime/
.tmp/
node_modules/
```

These can be large or temporary. Use targeted file paths only.

## Task To File Map

| User asks about | Start with |
| --- | --- |
| Mobile home UI | `public/routes/home.mjs`, `public/styles.css` |
| Reader scroll/images | `public/app.js`, `public/readerWindow.mjs`, `public/readerRestore.mjs`, `public/readingProgress.mjs` |
| Admin/crawl UI | `public/routes/admin.mjs`, `public/routes/adminSeriesEditorView.mjs`, `public/routes/adminRevenueView.mjs`, `public/routes/adminShellView.mjs`, `public/routes/adminImportProgressView.mjs`, `public/routes/adminCrawlQueueView.mjs`, `public/routes/adminS3SyncView.mjs`, `public/routes/adminTags.mjs`, `public/routes/adminSeriesView.mjs`, `public/routes/adminProductionView.mjs`, `server/index.mjs`, `server/crawlJobStore.mjs` |
| Production Health API | `server/adminProductionStatus.mjs`, `server/index.mjs`, `server/storageConfig.mjs` |
| New chapter updates | `server/importChapterSelection.mjs`, `server/importer.mjs`, `server/crawlQueue.mjs`, `server/crawlWorker.mjs`, `public/routes/admin.mjs` |
| Public catalog/filtering | `server/contentStore.mjs`, `server/dataStore.mjs`, `server/postgresStore.mjs` |
| Local DB/pgAdmin | `docs/agent-playbooks/local-postgres-pgadmin.md`, `.env.local`, `server/storageConfig.mjs`, `server/postgresStore.mjs` |
| Vercel frontend/admin API | `vercel.json`, `api/[...path].mjs`, `scripts/write-public-config.mjs`, `public/apiClient.mjs`, `server/index.mjs` |
| SEO shell/sitemap/copy | `server/seo.mjs`, `server/index.mjs`, `scripts/write-public-config.mjs`, `docs/agent-playbooks/seo-launch.md` |
| Encoding mojibake | `scripts/check-encoding.mjs`, then the reported files |

## Public Hosting Mental Model

The live public site is not a normal backend app:

```text
Vercel serves public/
public/config.js tells the browser to use live Vercel API when catalog storage resolves to PostgreSQL
S3 serves /imports/* images
Vercel Node API is for public reads/admin content edits
Local Node app is for crawler/optimizer/S3 sync
```


## Minimal Verification Choices

Pick the smallest useful check:

```powershell
node --check public\app.js
node --check public\routes\home.mjs
node --check public\routes\admin.mjs
npm run check:encoding
npm run db:setup:schema
npm run sync:s3:dry-run
npm test
```

Do not run full image sync or full tests unless the user asks or the change requires it.

## Common Safe Commands

Start local app:

```powershell
$env:PORT='54533'; npm run dev
```


```powershell
```

Vercel uses live Postgres/Supabase API; it only refreshes static fallback JSON.
Use `publish:series` for DB-aware production publishing.


```powershell
node scripts/sync-vietnix-s3.mjs --images-only --catalog-only --series-id <series-id> --apply
```

Promote one local catalog series to production DB:

```powershell
npm run sync:catalog:production -- --series-id <series-id> --apply
```

Run the full DB-aware publish flow for one series:

```powershell
npm run publish:series -- --series-id <series-id> --dry-run
npm run publish:series -- --series-id <series-id>
```

Deploy static frontend:

```powershell
npx vercel@latest deploy --prod --yes
```

## Safety Rules

- Never commit `.env.local` or S3 credentials.
- Never delete `data/imports/` unless the user explicitly asks.
- Never upload `data/imports/` to Vercel.
- Local PostgreSQL is the installed Windows service on `127.0.0.1:5432`; do not revive Docker port `55432` unless explicitly doing recovery.
- Keep crawler local or VPS-based; do not move long crawl jobs into Vercel Functions.
- Public APIs and static export must exclude `draft` and `removed` content.
