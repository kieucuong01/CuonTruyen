# Token-Efficient Agent Map

Use this file first when another AI agent enters the repo. The goal is to avoid reading the whole project or the huge `data/imports/` tree.

## First Five Files

Read these before broad searches:

```text
AGENTS.md
docs/agent-playbooks/current-deployment.md
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
| Admin/crawl UI | `public/routes/admin.mjs`, `server/index.mjs`, `server/crawlJobStore.mjs` |
| New chapter updates | `server/importer.mjs`, `server/crawlQueue.mjs`, `server/crawlWorker.mjs`, `public/routes/admin.mjs` |
| Public catalog/filtering | `server/contentStore.mjs`, `server/catalogStore.mjs` |
| Vercel frontend/admin API | `vercel.json`, `api/[...path].mjs`, `scripts/write-public-config.mjs`, `public/apiClient.mjs`, `server/index.mjs` |
| S3 sync/export | `scripts/export-static-api.mjs`, `scripts/sync-vietnix-s3.mjs`, `docs/agent-playbooks/vercel-s3-publishing.md` |
| SEO shell/sitemap | `server/seo.mjs`, `server/index.mjs`, `server/contentStore.mjs` |
| Encoding mojibake | `scripts/check-encoding.mjs`, then the reported files |

## Public Hosting Mental Model

The live public site is not a normal backend app:

```text
Vercel serves public/
public/config.js tells the browser to use live Vercel API when DATABASE_URL exists
S3 can still serve /static-api/*.json as fallback/cache
S3 serves /imports/* images
Vercel Node API is for public reads/admin content edits
Local Node app is for crawler/optimizer/S3 sync
```

So for public Vercel bugs, check static JSON and config first. Do not immediately debug server API routes unless the issue also happens locally.

## Minimal Verification Choices

Pick the smallest useful check:

```powershell
node --check public\app.js
node --check public\routes\home.mjs
node --check public\routes\admin.mjs
npm run check:encoding
npm run export:static-api
npm run sync:s3:dry-run
npm test
```

Do not run full image sync or full tests unless the user asks or the change requires it.

## Common Safe Commands

Start local app:

```powershell
$env:PORT='54533'; npm run dev
```

Export public JSON after local catalog changes:

```powershell
npm run export:static-api
```

Upload public JSON/images to S3:

```powershell
npm run sync:s3:dry-run
npm run sync:s3
```

Deploy static frontend:

```powershell
npx vercel@latest deploy --prod --yes
```

## Safety Rules

- Never commit `.env.local` or S3 credentials.
- Never delete `data/imports/` unless the user explicitly asks.
- Never upload `data/imports/` to Vercel.
- Keep crawler local or VPS-based; do not move long crawl jobs into Vercel Functions.
- Public APIs and static export must exclude `draft` and `removed` content.
