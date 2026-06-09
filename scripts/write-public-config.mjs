import fs from 'node:fs/promises';
import path from 'node:path';

import '../server/env.mjs';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const CONFIG_PATH = path.join(PUBLIC_DIR, 'config.js');

function trimTrailingSlash(value = '') {
  return String(value || '').trim().replace(/\/$/, '');
}

function serializeConfig(config) {
  return `window.COMIC_READER_CONFIG = {
  ...(window.COMIC_READER_CONFIG || {}),
  ${Object.entries(config)
    .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(',\n  ')}
};\n`;
}

const publicSiteUrl = siteBaseUrl();

const config = {
  apiBaseUrl: trimTrailingSlash(
    process.env.API_BASE_URL
    || process.env.PUBLIC_API_BASE_URL
    || (process.env.VERCEL === '1' ? publicSiteUrl : '')
  ),
  publicSnapshotBaseUrl: trimTrailingSlash(
    process.env.PUBLIC_SNAPSHOT_BASE_URL
    || process.env.STATIC_API_BASE_URL
    || '/static-api'
  ),
  preferPublicSnapshots: process.env.PUBLIC_SNAPSHOT_API === 'false'
    ? false
    : process.env.VERCEL === '1',
  importsBaseUrl: trimTrailingSlash(
    process.env.PUBLIC_IMPORTS_BASE_URL
    || process.env.S3_PUBLIC_BASE_URL
    || process.env.VIETNIX_S3_PUBLIC_BASE_URL
    || ''
  ),
  monetization: {
    adsEnabled: process.env.ADS_ENABLED !== 'false',
    donateUrl: process.env.DONATE_URL || '',
    adsProvider: process.env.ADS_PROVIDER || (process.env.ADSENSE_CLIENT ? 'adsense' : ''),
    adsenseClient: process.env.ADSENSE_CLIENT || '',
    adsenseSlots: {
      home: process.env.ADSENSE_SLOT_HOME || '',
      series: process.env.ADSENSE_SLOT_SERIES || '',
      chapterEnd: process.env.ADSENSE_SLOT_CHAPTER_END || ''
    },
    adsenseTestMode: String(process.env.ADSENSE_TEST_MODE || '').toLowerCase() === 'true'
  },
  publicSiteUrl,
  productionBaseUrl: trimTrailingSlash(process.env.PRODUCTION_BASE_URL || process.env.PUBLIC_SITE_URL || publicSiteUrl),
  enableLocalCrawlerUi: String(process.env.ENABLE_LOCAL_CRAWLER_UI || '').toLowerCase() === 'true'
};

function siteBaseUrl() {
  return trimTrailingSlash(
    process.env.SITE_BASE_URL
    || process.env.PUBLIC_SITE_URL
    || process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    || process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`
    || 'https://cuontruyen.vercel.app'
  );
}

function safeRoutePart(value = '') {
  const part = String(value || '').trim().replace(/^\/+|\/+$/g, '');
  if (!part || part === '.' || part === '..' || part.includes('/') || part.includes('\\')) return '';
  return part;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function writeRouteIndex(routePath, html) {
  const parts = routePath.split('/').map(safeRoutePart).filter(Boolean);
  if (!parts.length) return false;
  const routeDir = path.join(PUBLIC_DIR, ...parts);
  await fs.mkdir(routeDir, { recursive: true });
  await fs.writeFile(path.join(routeDir, 'index.html'), html, 'utf8');
  return true;
}

async function writeStaticInfoPages() {
  const {
    STATIC_PAGES,
    buildRobotsTxt,
    buildSitemapXml,
    controlledLandingPages,
    findRelatedSeries,
    renderChapterSeoPage,
    renderHomeSeoPage,
    renderLandingSeoPage,
    renderSeriesSeoPage,
    renderStaticPageShell,
    renderTagSeoPage,
    selectLandingPageSeries
  } = await import('../server/seo.mjs');
  const {
    buildHomeCollections,
    readPublicCatalog
  } = await import('../server/contentStore.mjs');
  const baseUrl = siteBaseUrl();
  for (const page of STATIC_PAGES) {
    await writeRouteIndex(page.path, renderStaticPageShell(page.path, baseUrl));
  }

  const publicData = await readPublicCatalog();
  const homeData = buildHomeCollections(publicData);
  const landingPages = controlledLandingPages();
  let seriesPageCount = 0;
  let chapterPageCount = 0;
  let tagPageCount = 0;
  let landingPageCount = 0;

  await fs.writeFile(path.join(PUBLIC_DIR, 'index.html'), renderHomeSeoPage({
    catalog: { series: publicData.series || [] },
    tags: homeData.tags || []
  }, baseUrl), 'utf8');
  await fs.writeFile(path.join(PUBLIC_DIR, 'robots.txt'), buildRobotsTxt(baseUrl), 'utf8');
  await fs.writeFile(path.join(PUBLIC_DIR, 'sitemap.xml'), buildSitemapXml(publicData.series || [], homeData.tags || [], baseUrl), 'utf8');

  for (const page of landingPages) {
    const seriesList = selectLandingPageSeries(page, publicData.series || []);
    if (await writeRouteIndex(page.path, renderLandingSeoPage({ page, seriesList }, baseUrl))) {
      landingPageCount += 1;
    }
  }

  for (const series of publicData?.series || []) {
    const seriesSlug = safeRoutePart(series.slug);
    if (!seriesSlug) continue;
    if (await writeRouteIndex(`/truyen/${seriesSlug}`, renderSeriesSeoPage({
      series,
      relatedSeries: findRelatedSeries(series, publicData.series || [])
    }, baseUrl))) {
      seriesPageCount += 1;
    }

    for (const chapter of series.chapters || []) {
      const chapterSlug = safeRoutePart(chapter.slug || chapter.id);
      if (!chapterSlug || chapter.status !== 'public' || !chapter.imported) continue;
      if (await writeRouteIndex(`/truyen/${seriesSlug}/${chapterSlug}`, renderChapterSeoPage({ series, chapter }, baseUrl))) {
        chapterPageCount += 1;
      }
    }
  }

  for (const tag of homeData?.tags || []) {
    const tagSlug = safeRoutePart(tag.slug);
    if (!tagSlug) continue;
    if (await writeRouteIndex(`/the-loai/${tagSlug}`, renderTagSeoPage({
      page: { tag: { ...tag, slug: tagSlug }, series: [] }
    }, baseUrl))) {
      tagPageCount += 1;
    }
  }

  console.log(`[vercel-static-pages] wrote ${STATIC_PAGES.length} static info pages, ${landingPageCount} landing pages, ${seriesPageCount} series pages, ${chapterPageCount} chapter pages, ${tagPageCount} tag pages with baseUrl=${baseUrl}`);
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload), 'utf8');
}

async function writePublicSnapshotApi() {
  const {
    buildHomeCollections,
    buildTagIndex,
    buildTagPage,
    publicCatalog,
    publicSeriesDetail
  } = await import('../server/contentStore.mjs');
  const { readCatalog } = await import('../server/dataStore.mjs');
  const staticApiDir = path.join(PUBLIC_DIR, 'static-api');
  const catalog = await readCatalog({ includePages: false });
  const publicData = publicCatalog(catalog, { chapterLimit: 3 });
  const tags = buildTagIndex(catalog);
  let detailCount = 0;
  let tagCount = 0;

  await fs.rm(staticApiDir, { recursive: true, force: true });
  await writeJson(path.join(staticApiDir, 'home.json'), buildHomeCollections(catalog));
  await writeJson(path.join(staticApiDir, 'series.json'), publicData);
  await writeJson(path.join(staticApiDir, 'search-index.json'), publicData);

  for (const series of catalog.series || []) {
    const detail = publicSeriesDetail(series);
    if (detail.status !== 'public') continue;
    const seriesSlug = safeRoutePart(detail.slug);
    const seriesId = safeRoutePart(detail.id);
    if (seriesSlug) {
      await writeJson(path.join(staticApiDir, 'series', `${seriesSlug}.json`), detail);
      detailCount += 1;
    }
    if (seriesId && seriesId !== seriesSlug) {
      await writeJson(path.join(staticApiDir, 'series', `${seriesId}.json`), detail);
    }
  }

  for (const tag of tags) {
    const tagSlug = safeRoutePart(tag.slug);
    if (!tagSlug) continue;
    const page = buildTagPage(catalog, tagSlug);
    if (!page) continue;
    await writeJson(path.join(staticApiDir, 'tags', `${tagSlug}.json`), page);
    tagCount += 1;
  }

  await writeJson(path.join(staticApiDir, 'manifest.json'), {
    generatedAt: new Date().toISOString(),
    source: 'postgres-build-snapshot',
    seriesCount: publicData.series.length,
    detailCount,
    tagCount
  });
  console.log(`[vercel-static-api] wrote public snapshots for ${publicData.series.length} series, ${detailCount} detail pages, ${tagCount} tags`);
}

await fs.mkdir(PUBLIC_DIR, { recursive: true });
await fs.writeFile(CONFIG_PATH, serializeConfig(config), 'utf8');
console.log(`[vercel-config] wrote public/config.js with apiBaseUrl=${config.apiBaseUrl || '(same-origin)'}`);
await writeStaticInfoPages();
await writePublicSnapshotApi();
