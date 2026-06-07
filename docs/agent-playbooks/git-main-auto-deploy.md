# Git main auto-deploy flow

This project should deploy to Vercel from GitHub, not from routine local CLI uploads.

## Current rule

- Production branch: `main`
- Git remote: `https://github.com/kieucuong01/CuonTruyen.git`
- Vercel project: `cuontruyen`
- Public URL: `https://cuontruyen.vercel.app`
- Expected Vercel alias after a main deploy: `cuontruyen-git-main-kieucuong01-6996s-projects.vercel.app`

## Normal deploy steps

Run checks first when code changed:

```powershell
node --check public\app.js
npm test
```

Commit and push only the intended files:

```powershell
git add -- <files>
git commit -m "Short clear message"
git push origin main
```

After push, Vercel should build automatically from the GitHub `main` branch.

Verify:

```powershell
npx vercel ls cuontruyen
npx vercel inspect <latest-production-deployment-url>
```

A healthy deployment should show:

- `Status`: `Ready`
- `Environment`: `Production`
- Alias includes `https://cuontruyen.vercel.app`
- Alias includes `cuontruyen-git-main-...`

Smoke check:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri "https://cuontruyen.vercel.app/" -TimeoutSec 20
Invoke-WebRequest -UseBasicParsing -Uri "https://cuontruyen.vercel.app/app.js" -TimeoutSec 20
```

## Do not use direct CLI deploy by default

Avoid this for normal releases:

```powershell
npx vercel --prod
```

Reason: this repo has many static files. Direct CLI upload can hit Vercel upload limits or abort mid-upload. GitHub-to-Vercel deploy is the safer default.

If a manual emergency deploy is unavoidable, prefer:

```powershell
npx vercel --prod --yes --archive=tgz
```

Even then, check `npx vercel ls cuontruyen` afterward before assuming it worked.

## Notes for future agents

- Do not commit `.vercel/`, `.env`, `.env.local`, S3 credentials, logs, runtime folders, or `data/imports/`.
- Do not deploy admin/crawler flows to Vercel as if they were production crawler workers. Current production reading flow is frontend plus live DB-backed API, with S3 static JSON/assets as fallback.
- If a production page breaks after push, inspect `/app.js`, `/config.js`, the live `/api/*` payload or `/static-api/manifest.json` fallback, and the exact route before changing unrelated code.
