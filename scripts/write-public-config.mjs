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

const config = {
  apiBaseUrl: trimTrailingSlash(process.env.API_BASE_URL || process.env.PUBLIC_API_BASE_URL || ''),
  staticApiMode: String(process.env.STATIC_API_MODE || '').toLowerCase() === 'true',
  staticApiBaseUrl: trimTrailingSlash(process.env.STATIC_API_BASE_URL || process.env.PUBLIC_STATIC_API_BASE_URL || ''),
  importsBaseUrl: trimTrailingSlash(
    process.env.PUBLIC_IMPORTS_BASE_URL
    || process.env.S3_PUBLIC_BASE_URL
    || process.env.VIETNIX_S3_PUBLIC_BASE_URL
    || ''
  )
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
  const { STATIC_PAGES, renderHtmlShell, renderStaticPageShell, seriesJsonLd, chapterJsonLd } = await import('../server/seo.mjs');
  const baseUrl = siteBaseUrl();
  for (const page of STATIC_PAGES) {
    await writeRouteIndex(page.path, renderStaticPageShell(page.path, baseUrl));
  }

  const publicData = await readPublicJson(path.join('static-api', 'series.json'));
  const homeData = await readPublicJson(path.join('static-api', 'home.json'));
  let seriesPageCount = 0;
  let chapterPageCount = 0;
  let tagPageCount = 0;

  for (const series of publicData?.series || []) {
    const seriesSlug = safeRoutePart(series.slug);
    if (!seriesSlug) continue;
    const seriesUrl = `${baseUrl}/truyen/${seriesSlug}`;
    const seriesTitle = `${series.title} - Đọc truyện tranh online tại Cuộn Truyện`;
    const seriesDescription = series.description || `Đọc ${series.title} online, tự lưu vị trí đọc và mở lại đúng chương trên Cuộn Truyện.`;
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
      const chapterDescription = `Đọc ${chapterTitle} online tại Cuộn Truyện.`;
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
    const title = `${tag.name || tag.slug} - Truyện tranh theo thể loại`;
    if (await writeRouteIndex(`/the-loai/${tagSlug}`, renderHtmlShell({
      title,
      description: `Đọc truyện tranh thể loại ${tag.name || tag.slug} trên Cuộn Truyện.`,
      canonicalUrl: `${baseUrl}/the-loai/${tagSlug}`,
      bodyHtml: `<main id="app" class="site-shell static-page"><section class="page-heading static-page-heading"><h1>${escapeHtml(title)}</h1></section></main>`
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
