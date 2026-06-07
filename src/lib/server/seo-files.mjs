import { buildHomeCollections, publicCatalog } from '../../../server/contentStore.mjs';
import { readCatalog } from '../../../server/dataStore.mjs';
import { buildRobotsTxt, buildSitemapXml } from '../../../server/seo.mjs';

function siteBaseUrl() {
  return String(
    process.env.PUBLIC_SITE_URL
    || process.env.NEXT_PUBLIC_SITE_URL
    || process.env.SITE_BASE_URL
    || 'https://cuontruyen.vercel.app'
  ).replace(/\/+$/, '');
}

export async function nextRobotsTxt() {
  return buildRobotsTxt(siteBaseUrl());
}

export async function nextSitemapXml(options = {}) {
  const catalog = options.catalog || await readCatalog({ includePages: false });
  const publicData = publicCatalog(catalog);
  const home = buildHomeCollections(catalog);
  return buildSitemapXml(publicData.series || [], home.tags || [], siteBaseUrl());
}
