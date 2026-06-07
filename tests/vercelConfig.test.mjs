import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('vercel config lets live API routes reach serverless functions', () => {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const rewrites = config.rewrites || [];

  assert.equal(config.buildCommand, 'npm run build:vercel');
  assert.equal(config.outputDirectory, undefined);
  assert.equal(
    rewrites.some((rewrite) => String(rewrite.source || '').startsWith('/api/')),
    false
  );
  assert.equal(
    rewrites.some((rewrite) => String(rewrite.source || '').startsWith('/static-api/')),
    false
  );
});

test('package scripts make Next the default app while preserving local pipeline runtime', () => {
  const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const scripts = manifest.scripts || {};

  assert.equal(scripts.dev, 'next dev --hostname 0.0.0.0');
  assert.equal(scripts.build, 'next build');
  assert.equal(scripts.start, 'next start');
  assert.equal(scripts['dev:legacy'], 'node server/index.mjs');
  assert.equal(scripts['local:pipeline'], 'node server/index.mjs');
  assert.equal(scripts['worker:crawl'], 'node server/crawlWorker.mjs');
  assert.match(scripts['build:vercel'], /scripts\/build-vercel\.mjs/);
});

test('vercel routes public SEO traffic to Next instead of the legacy SPA', () => {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const rewrites = config.rewrites || [];

  assert.equal(config.cleanUrls, undefined);
  assert.equal(rewrites.some((rewrite) => String(rewrite.source || '').startsWith('/truyen')), false);
  assert.equal(rewrites.some((rewrite) => String(rewrite.source || '').startsWith('/the-loai')), false);
  for (const staticPath of ['/gioi-thieu', '/lien-he', '/chinh-sach-noi-dung', '/privacy']) {
    assert.equal(rewrites.some((rewrite) => rewrite.source === staticPath), false, `${staticPath} should be served by Next`);
  }
  assert.equal(rewrites.some((rewrite) => String(rewrite.source || '').startsWith('/admin')), false);
  assert.equal(rewrites.every((rewrite) => rewrite.destination !== '/index'), true);
});

test('vercel keeps no legacy serverless API wrappers after App Router migration', () => {
  assert.equal(fs.existsSync('api/[...path].mjs'), false);
  assert.equal(fs.existsSync('api/reader.js'), false);
  assert.equal(fs.existsSync('api/series.js'), false);
  assert.equal(fs.existsSync('api/users/login.js'), false);
  assert.equal(fs.existsSync('api/users/register.js'), false);
  assert.equal(fs.existsSync('api/users/me.js'), false);
  assert.equal(fs.existsSync('api/users/logout.js'), false);
  assert.equal(fs.existsSync('api/bulletin/messages.js'), false);
  assert.equal(fs.existsSync('api/auth/google/start.js'), false);
  assert.equal(fs.existsSync('api/auth/google/callback.js'), false);
  assert.equal(fs.existsSync('api/admin/bulletin/messages.js'), false);
  assert.equal(fs.existsSync('api/admin/bulletin/messages/[id].js'), false);
  assert.equal(fs.existsSync('api/admin/[...path].js'), false);
});

test('vercel has no legacy public series API files competing with App Router', () => {
  for (const conflictingFile of [
    'api/series.js',
    'api/reader.js',
    'api/series/[...path].js',
    'api/series/[id].js',
    'api/series/[series]/chapters/[chapter].js',
    'api/series/[series]/chapters/[chapter]/next.js'
  ]) {
    assert.equal(fs.existsSync(conflictingFile), false, `${conflictingFile} conflicts with flat api/series.js`);
  }
});

test('next app router owns public read API route handlers', () => {
  for (const routeFile of [
    'src/app/api/home/route.ts',
    'src/app/api/public/home/route.ts',
    'src/app/api/search/route.ts',
    'src/app/api/tags/[tagSlug]/route.ts',
    'src/app/api/series/route.ts',
    'src/app/api/series/[seriesSlug]/route.ts',
    'src/app/api/reader/route.ts',
    'src/app/api/series/[seriesSlug]/chapters/[chapterSlug]/route.ts',
    'src/app/api/series/[seriesSlug]/chapters/[chapterSlug]/next/route.ts'
  ]) {
    assert.equal(fs.existsSync(routeFile), true, `${routeFile} should exist`);
    assert.match(fs.readFileSync(routeFile, 'utf8'), /nextPublic|jsonApi/);
  }
});

test('public Next SEO pages stay build-safe and use CDN cache headers', () => {
  const nextConfigSource = fs.readFileSync('next.config.mjs', 'utf8');
  for (const publicSource of [
    "source: '/'",
    "source: '/truyen/:path*'",
    "source: '/the-loai/:path*'",
    "source: '/gioi-thieu'",
    "source: '/lien-he'",
    "source: '/chinh-sach-noi-dung'",
    "source: '/privacy'"
  ]) {
    assert.match(nextConfigSource, new RegExp(publicSource.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(nextConfigSource, /s-maxage=300/);
  assert.match(nextConfigSource, /stale-while-revalidate=600/);

  for (const routeFile of [
    'src/app/page.tsx',
    'src/app/truyen/[seriesSlug]/page.tsx',
    'src/app/truyen/[seriesSlug]/[chapterSlug]/page.tsx',
    'src/app/the-loai/[tagSlug]/page.tsx'
  ]) {
    const source = fs.readFileSync(routeFile, 'utf8');
    assert.match(source, /export const dynamic = ['"]force-dynamic['"]/);
    assert.doesNotMatch(source, /export const revalidate = \d+/);
  }
});

test('public read APIs emit CDN-cacheable responses without build-time prerendering', () => {
  const responseHelper = fs.readFileSync('src/lib/server/api-response.ts', 'utf8');
  assert.match(responseHelper, /publicJsonApi/);
  assert.match(responseHelper, /s-maxage/);
  assert.match(responseHelper, /stale-while-revalidate/);

  for (const routeFile of [
    'src/app/api/home/route.ts',
    'src/app/api/public/home/route.ts',
    'src/app/api/search/route.ts',
    'src/app/api/tags/[tagSlug]/route.ts',
    'src/app/api/series/route.ts',
    'src/app/api/series/[seriesSlug]/route.ts',
    'src/app/api/reader/route.ts',
    'src/app/api/series/[seriesSlug]/chapters/[chapterSlug]/route.ts',
    'src/app/api/series/[seriesSlug]/chapters/[chapterSlug]/next/route.ts'
  ]) {
    const source = fs.readFileSync(routeFile, 'utf8');
    assert.match(source, /publicJsonApi/);
    assert.match(source, /export const dynamic = ['"]force-dynamic['"]/);
    assert.doesNotMatch(source, /export const revalidate = \d+/);
    assert.doesNotMatch(source, /cache-control['"]:\s*['"]no-store/);
  }

  for (const privateRouteFile of [
    'src/app/api/admin/session/route.ts',
    'src/app/api/users/me/route.ts',
    'src/app/api/events/route.ts',
    'src/app/api/admin/catalog/route.ts',
    'src/app/api/admin/import-jobs/route.ts'
  ]) {
    const source = fs.readFileSync(privateRouteFile, 'utf8');
    assert.match(source, /export const dynamic = ['"]force-dynamic['"]/);
    assert.doesNotMatch(source, /publicJsonApi|export const revalidate/);
  }
});

test('next app router owns user, bulletin, auth, and analytics API route handlers', () => {
  for (const routeFile of [
    'src/app/api/users/register/route.ts',
    'src/app/api/users/login/route.ts',
    'src/app/api/users/me/route.ts',
    'src/app/api/users/logout/route.ts',
    'src/app/api/bulletin/messages/route.ts',
    'src/app/api/auth/google/start/route.ts',
    'src/app/api/auth/google/callback/route.ts',
    'src/app/api/events/route.ts',
    'src/app/api/admin/session/route.ts',
    'src/app/api/admin/bulletin/messages/route.ts',
    'src/app/api/admin/bulletin/messages/[messageId]/route.ts'
  ]) {
    assert.equal(fs.existsSync(routeFile), true, `${routeFile} should exist`);
    assert.match(fs.readFileSync(routeFile, 'utf8'), /nodeApiHandlerAsNext|jsonApi|adminApi/);
  }
});

test('next app router owns admin content APIs and production-safe local pipeline stubs', () => {
  for (const routeFile of [
    'src/app/api/admin/catalog/route.ts',
    'src/app/api/admin/series/route.ts',
    'src/app/api/admin/series/[seriesId]/route.ts',
    'src/app/api/admin/series/[seriesId]/chapters/[chapterId]/route.ts',
    'src/app/api/admin/chapters/[chapterId]/route.ts',
    'src/app/api/admin/series/[seriesId]/crawl-schedule/route.ts',
    'src/app/api/admin/events/route.ts',
    'src/app/api/admin/analytics/summary/route.ts'
  ]) {
    assert.equal(fs.existsSync(routeFile), true, `${routeFile} should exist`);
    assert.match(fs.readFileSync(routeFile, 'utf8'), /nextAdminContent|adminJsonApi/);
  }

  for (const localPipelineRouteFile of [
    'src/app/api/admin/import-jobs/route.ts',
    'src/app/api/admin/import-jobs/summary/route.ts',
    'src/app/api/admin/import-jobs/wake/route.ts',
    'src/app/api/admin/import-jobs/[jobId]/route.ts',
    'src/app/api/admin/series/[seriesId]/update-chapters/route.ts',
    'src/app/api/admin/series/[seriesId]/publish-production/route.ts',
    'src/app/api/admin/s3-sync/status/route.ts',
    'src/app/api/admin/s3-sync/retry-failed/route.ts',
    'src/app/api/admin/production-status/route.ts',
    'src/app/api/admin/production-check/route.ts',
    'src/app/api/admin/production-jobs/[jobId]/route.ts',
    'src/app/api/import/route.ts',
    'src/app/api/import/[jobId]/route.ts'
  ]) {
    assert.equal(fs.existsSync(localPipelineRouteFile), true, `${localPipelineRouteFile} should exist`);
    const source = fs.readFileSync(localPipelineRouteFile, 'utf8');
    assert.match(source, /nextLocalPipelineUnavailableApi/);
    assert.doesNotMatch(source, /crawlWorker|sync-vietnix|productionPublishJobs|child_process|spawn\(/);
  }
});

test('next app router owns robots and sitemap', () => {
  for (const routeFile of [
    'src/app/robots.txt/route.ts',
    'src/app/sitemap.xml/route.ts'
  ]) {
    const source = fs.readFileSync(routeFile, 'utf8');
    assert.equal(fs.existsSync(routeFile), true, `${routeFile} should exist`);
    assert.match(source, /NextResponse|Response/);
    assert.match(source, /export const dynamic = ['"]force-dynamic['"]/);
    assert.match(source, /s-maxage/);
    assert.doesNotMatch(source, /no-store|export const revalidate/);
  }
});

test('next app router owns static policy pages', () => {
  for (const routeFile of [
    'src/app/gioi-thieu/page.tsx',
    'src/app/lien-he/page.tsx',
    'src/app/chinh-sach-noi-dung/page.tsx',
    'src/app/privacy/page.tsx'
  ]) {
    assert.equal(fs.existsSync(routeFile), true, `${routeFile} should exist`);
    assert.match(fs.readFileSync(routeFile, 'utf8'), /StaticInfoPage|nextStaticPageData/);
  }
});

test('next app router owns admin shell pages without moving crawler controls to Vercel', () => {
  const adminPageSource = fs.readFileSync('src/app/admin/page.tsx', 'utf8');
  assert.match(adminPageSource, /AdminDashboardIsland/);
  assert.doesNotMatch(adminPageSource, /LegacyAdminShell/);
  assert.match(adminPageSource, /robots/);

  const adminSeriesSource = fs.readFileSync('src/app/admin/series/[seriesId]/page.tsx', 'utf8');
  assert.match(adminSeriesSource, /AdminSeriesEditorIsland/);
  assert.doesNotMatch(adminSeriesSource, /LegacyAdminShell/);
  assert.match(adminSeriesSource, /robots/);

  assert.equal(fs.existsSync('src/components/admin/LegacyAdminShell.tsx'), false);

  const dashboardSource = fs.readFileSync('src/components/admin/AdminDashboardIsland.tsx', 'utf8');
  assert.match(dashboardSource, /\/api\/admin\/catalog/);
  assert.doesNotMatch(dashboardSource, /import-jobs|s3-sync|publish-production|update-chapters/);

  const editorSource = fs.readFileSync('src/components/admin/AdminSeriesEditorIsland.tsx', 'utf8');
  assert.match(editorSource, /\/api\/admin\/series/);
  assert.doesNotMatch(editorSource, /import-jobs|s3-sync|publish-production|update-chapters|production-check/);
});

test('vercel ignores legacy static SEO exports that can shadow Next routes', () => {
  const ignore = fs.readFileSync('.vercelignore', 'utf8');

  for (const ignored of [
    'public/index.html',
    'public/app.js',
    'public/routes/',
    'public/static-api/',
    'public/fallback-api/',
    'public/truyen/',
    'public/the-loai/',
    'public/sitemap.xml',
    'public/robots.txt',
    'public/gioi-thieu/',
    'public/lien-he/',
    'public/chinh-sach-noi-dung/',
    'public/privacy/'
  ]) {
    assert.match(ignore, new RegExp(ignored.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('vercel production blocks local-only publish pipeline API', () => {
  const source = fs.readFileSync('server/index.mjs', 'utf8');

  assert.match(source, /function localAdminOperationsEnabled\(\)/);
  assert.match(source, /ENABLE_LOCAL_CRAWLER_UI/);
  assert.match(source, /publish-production/);
  assert.match(source, /Production pipeline/);
  assert.match(source, /admin local\/crawler/);
});

test('vercel build and public config honor DB-first catalog mode', () => {
  const buildSource = fs.readFileSync('scripts/build-vercel.mjs', 'utf8');
  const configSource = fs.readFileSync('scripts/write-public-config.mjs', 'utf8');

  assert.match(buildSource, /requirePostgresCatalogUrl/);
  assert.match(buildSource, /next['"]?, 'build'|next.*build/);
  assert.match(buildSource, /SKIP_STATIC_SEO_EXPORT/);
  assert.match(configSource, /SKIP_STATIC_SEO_EXPORT/);
  assert.doesNotMatch(buildSource, /exportStaticApi|VERCEL_EXPORT_STATIC_API|STATIC_API_OUTPUT_DIR/);
  assert.doesNotMatch(configSource, /staticApiMode|staticApiBaseUrl|FORCE_STATIC_API_MODE|STATIC_API_BASE_URL/);
});
