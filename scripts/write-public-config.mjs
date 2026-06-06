import fs from 'node:fs/promises';
import path from 'node:path';

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
const staticApiMode = resolveStaticApiMode();

const config = {
  apiBaseUrl: trimTrailingSlash(
    process.env.API_BASE_URL
    || process.env.PUBLIC_API_BASE_URL
    || (!staticApiMode && process.env.VERCEL === '1' ? publicSiteUrl : '')
  ),
  staticApiMode,
  staticApiBaseUrl: trimTrailingSlash(process.env.STATIC_API_BASE_URL || process.env.PUBLIC_STATIC_API_BASE_URL || ''),
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

function resolveStaticApiMode() {
  const hasLiveDatabase = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  if (process.env.FORCE_STATIC_API_MODE) {
    return String(process.env.FORCE_STATIC_API_MODE || '').toLowerCase() === 'true';
  }
  if (process.env.VERCEL === '1' && hasLiveDatabase) return false;
  return String(process.env.STATIC_API_MODE || '').toLowerCase() === 'true';
}

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

async function readPublicJson(relativePath) {
  try {
    return JSON.parse(await fs.readFile(path.join(PUBLIC_DIR, relativePath), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
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
    renderHtmlShell,
    renderStaticPageShell,
    seriesJsonLd,
    chapterJsonLd,
    tagPageJsonLd,
    tagSeoCopy
  } = await import('../server/seo.mjs');
  const baseUrl = siteBaseUrl();
  for (const page of STATIC_PAGES) {
    await writeRouteIndex(page.path, renderStaticPageShell(page.path, baseUrl));
  }

  const publicData = await readPublicJson(path.join('static-api', 'series.json'))
    || await readPublicJson(path.join('fallback-api', 'series.json'))
    || { series: [] };
  const homeData = await readPublicJson(path.join('static-api', 'home.json'))
    || await readPublicJson(path.join('fallback-api', 'home.json'))
    || { tags: [] };
  let seriesPageCount = 0;
  let chapterPageCount = 0;
  let tagPageCount = 0;

  await fs.writeFile(path.join(PUBLIC_DIR, 'robots.txt'), buildRobotsTxt(baseUrl), 'utf8');
  await fs.writeFile(path.join(PUBLIC_DIR, 'sitemap.xml'), buildSitemapXml(publicData.series || [], homeData.tags || [], baseUrl), 'utf8');

  for (const series of publicData?.series || []) {
    const seriesSlug = safeRoutePart(series.slug);
    if (!seriesSlug) continue;
    const seriesUrl = `${baseUrl}/truyen/${seriesSlug}`;
    const seriesTitle = `${series.title} - ??c truy?n tranh online t?i Cu?n Truy?n`;
    const seriesDescription = series.description || `??c ${series.title} online t?i Cu?n Truy?n, reader cu?n d?c m??t, t? l?u v? tr? v? m? l?i ??ng ch??ng ?ang ??c.`;
    if (await writeRouteIndex(`/truyen/${seriesSlug}`, renderHtmlShell({
      title: seriesTitle,
      description: seriesDescription,
      canonicalUrl: seriesUrl,
      imageUrl: series.coverUrl || series.thumbnailUrl || '',
      jsonLd: seriesJsonLd(series, baseUrl),
      bodyHtml: `<main id="app" class="site-shell static-page"><section class="page-heading static-page-heading"><h1>${escapeHtml(series.title)}</h1><p>${escapeHtml(seriesDescription)}</p></section></main>`
    }))) {
      seriesPageCount += 1;
    }

    for (const chapter of series.chapters || []) {
      const chapterSlug = safeRoutePart(chapter.slug || chapter.id);
      if (!chapterSlug || chapter.status !== 'public' || !chapter.imported) continue;
      const chapterTitle = `${series.title} - ${chapter.label || chapter.title || chapterSlug}`;
      const chapterDescription = `??c ${chapterTitle} online t?i Cu?n Truy?n v?i ?nh t?i nhanh, ??c d?c li?n m?ch v? t? l?u ti?n ??.`;
      if (await writeRouteIndex(`/truyen/${seriesSlug}/${chapterSlug}`, renderHtmlShell({
        title: chapterTitle,
        description: chapterDescription,
        canonicalUrl: `${seriesUrl}/${chapterSlug}`,
        imageUrl: series.coverUrl || series.thumbnailUrl || '',
        jsonLd: chapterJsonLd(series, chapter, baseUrl),
        bodyHtml: `<main id="app" class="site-shell static-page"><section class="page-heading static-page-heading"><h1>${escapeHtml(chapterTitle)}</h1><p>${escapeHtml(chapterDescription)}</p></section></main>`
      }))) {
        chapterPageCount += 1;
      }
    }
  }

  for (const tag of homeData?.tags || []) {
    const tagSlug = safeRoutePart(tag.slug);
    if (!tagSlug) continue;
    const copy = tagSeoCopy({ ...tag, slug: tagSlug });
    if (await writeRouteIndex(`/the-loai/${tagSlug}`, renderHtmlShell({
      title: copy.title,
      description: copy.description,
      canonicalUrl: `${baseUrl}/the-loai/${tagSlug}`,
      jsonLd: tagPageJsonLd({ tag: { ...tag, slug: tagSlug }, series: [] }, baseUrl),
      bodyHtml: `<main id="app" class="site-shell static-page"><section class="page-heading static-page-heading"><h1>${escapeHtml(copy.title)}</h1><p>${escapeHtml(copy.description)}</p></section></main>`
    }))) {
      tagPageCount += 1;
    }
  }

  console.log(`[vercel-static-pages] wrote ${STATIC_PAGES.length} static info pages, ${seriesPageCount} series pages, ${chapterPageCount} chapter pages, ${tagPageCount} tag pages with baseUrl=${baseUrl}`);
}

await fs.mkdir(PUBLIC_DIR, { recursive: true });
await fs.writeFile(CONFIG_PATH, serializeConfig(config), 'utf8');
console.log(`[vercel-config] wrote public/config.js with apiBaseUrl=${config.apiBaseUrl || '(same-origin)'}`);
await writeStaticInfoPages();
