export { chapterJsonLd, seriesJsonLd, tagPageJsonLd } from '../../../server/seo.mjs';

function normalizedSiteBase(baseUrl = 'https://cuontruyen.vercel.app') {
  return String(baseUrl || '').replace(/\/+$/, '') || 'https://cuontruyen.vercel.app';
}

function absoluteBreadcrumbUrl(path = '/', baseUrl = 'https://cuontruyen.vercel.app') {
  const normalizedBase = normalizedSiteBase(baseUrl);
  const rawPath = String(path || '').trim();
  if (!rawPath) return '';
  if (/^https?:\/\//i.test(rawPath)) return rawPath;
  const normalizedPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  return normalizedPath === '/' ? `${normalizedBase}/` : `${normalizedBase}${normalizedPath}`;
}

export function breadcrumbJsonLd(items = [], baseUrl = 'https://cuontruyen.vercel.app') {
  const itemListElement = [];

  for (const item of items) {
    const name = String(item?.name || '').trim();
    const url = absoluteBreadcrumbUrl(item?.path || item?.url || '', baseUrl);
    if (!name || !url) continue;
    itemListElement.push({
      '@type': 'ListItem',
      position: itemListElement.length + 1,
      name,
      item: url
    });
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement
  };
}

export function staticPageJsonLd(page = {}, baseUrl = 'https://cuontruyen.vercel.app') {
  const normalizedBase = normalizedSiteBase(baseUrl);
  const url = absoluteBreadcrumbUrl(page.path || '/', normalizedBase);
  const name = String(page.title || page.heading || '').trim();
  const description = String(page.description || '').trim();

  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url,
    isPartOf: {
      '@type': 'WebSite',
      name: 'Cuộn Truyện',
      url: `${normalizedBase}/`
    }
  };
}

export function homePageJsonLd(home = {}, baseUrl = 'https://cuontruyen.vercel.app') {
  const normalizedBase = normalizedSiteBase(baseUrl);
  const seen = new Set();
  const source = [...(home.updated || []), ...(home.popular || [])];
  const itemListElement = [];

  for (const series of source) {
    const slug = String(series?.slug || '').trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    itemListElement.push({
      '@type': 'ListItem',
      position: itemListElement.length + 1,
      name: series.title,
      url: `${normalizedBase}/truyen/${slug}`
    });
    if (itemListElement.length >= 24) break;
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Cuộn Truyện',
    url: `${normalizedBase}/`,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${normalizedBase}/?q={search_term_string}`,
      'query-input': 'required name=search_term_string'
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement
    }
  };
}
