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
  staticApiBaseUrl: trimTrailingSlash(process.env.STATIC_API_BASE_URL || process.env.PUBLIC_STATIC_API_BASE_URL || '')
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

async function writeStaticInfoPages() {
  const { STATIC_PAGES, renderStaticPageShell } = await import('../server/seo.mjs');
  const baseUrl = siteBaseUrl();
  for (const page of STATIC_PAGES) {
    const routeName = page.path.replace(/^\/+/, '');
    if (!routeName || routeName.includes('..')) continue;
    const routeDir = path.join(PUBLIC_DIR, routeName);
    await fs.mkdir(routeDir, { recursive: true });
    await fs.writeFile(path.join(routeDir, 'index.html'), renderStaticPageShell(page.path, baseUrl), 'utf8');
  }
  console.log(`[vercel-static-pages] wrote ${STATIC_PAGES.length} static info pages with baseUrl=${baseUrl}`);
}

await fs.mkdir(PUBLIC_DIR, { recursive: true });
await fs.writeFile(CONFIG_PATH, serializeConfig(config), 'utf8');
console.log(`[vercel-config] wrote public/config.js with apiBaseUrl=${config.apiBaseUrl || '(same-origin)'}`);
await writeStaticInfoPages();
