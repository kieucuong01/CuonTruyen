import { buildTagIndex, normalizeSeries } from './contentStore.mjs';

const DEFAULT_DESCRIPTION = 'Doc truyen tranh manhua, manhwa tieng Viet voi reader lien tuc, nhanh va nhe.';

export function absoluteUrl(value, baseUrl) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return new URL(value, baseUrl).toString();
}

export function seriesJsonLd(series, baseUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ComicSeries',
    name: series.title,
    alternateName: series.aliases || [],
    description: series.description || DEFAULT_DESCRIPTION,
    url: `${baseUrl}/truyen/${series.slug}`,
    image: absoluteUrl(series.coverUrl, baseUrl) || undefined,
    genre: (series.tags || []).map((tag) => tag.name)
  };
}

export function chapterJsonLd(series, chapter, baseUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ComicIssue',
    name: `${series.title} - ${chapter.title || chapter.label}`,
    url: `${baseUrl}/truyen/${series.slug}/${chapter.slug}`,
    isPartOf: {
      '@type': 'ComicSeries',
      name: series.title,
      url: `${baseUrl}/truyen/${series.slug}`
    },
    image: chapter.pages?.[0]?.imageUrl ? absoluteUrl(chapter.pages[0].imageUrl, baseUrl) : undefined,
    datePublished: chapter.publishedAt || series.updatedAt || undefined
  };
}

export function buildSitemapXml(seriesList, tags, baseUrl) {
  const urls = [
    { loc: baseUrl, lastmod: new Date().toISOString() },
    ...seriesList.flatMap((series) => {
      const normalized = normalizeSeries(series);
      return [
        { loc: `${baseUrl}/truyen/${normalized.slug}`, lastmod: normalized.updatedAt },
        ...normalized.chapters
          .filter((chapter) => chapter.status === 'public' && chapter.pages.length > 0)
          .map((chapter) => ({
            loc: `${baseUrl}/truyen/${normalized.slug}/${chapter.slug}`,
            lastmod: chapter.updatedAt || normalized.updatedAt
          }))
      ];
    }),
    ...tags.map((tag) => ({ loc: `${baseUrl}/the-loai/${tag.slug}` }))
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((item) => `  <url>\n    <loc>${escapeXml(item.loc)}</loc>${item.lastmod ? `\n    <lastmod>${escapeXml(item.lastmod)}</lastmod>` : ''}\n  </url>`).join('\n')}\n</urlset>\n`;
}

export function buildRobotsTxt(baseUrl) {
  return [
    'User-agent: *',
    'Allow: /',
    `Sitemap: ${baseUrl}/sitemap.xml`,
    ''
  ].join('\n');
}

export function buildSiteMapFromCatalog(catalog, baseUrl) {
  const series = (catalog.series || [])
    .map(normalizeSeries)
    .filter((item) => item.status === 'public');
  return buildSitemapXml(series, buildTagIndex(catalog), baseUrl);
}

export function renderHtmlShell({
  title = 'K-Scroll Reader',
  description = DEFAULT_DESCRIPTION,
  canonicalUrl = '',
  imageUrl = '',
  jsonLd = null
} = {}) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description || DEFAULT_DESCRIPTION);
  const safeCanonical = escapeHtml(canonicalUrl);
  const safeImage = escapeHtml(imageUrl);
  return `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDescription}">
    ${safeCanonical ? `<link rel="canonical" href="${safeCanonical}">` : ''}
    <meta property="og:title" content="${safeTitle}">
    <meta property="og:description" content="${safeDescription}">
    ${safeImage ? `<meta property="og:image" content="${safeImage}">` : ''}
    <link rel="stylesheet" href="/styles.css" />
    ${jsonLd ? `<script type="application/ld+json">${escapeScriptJson(jsonLd)}</script>` : ''}
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/app.js"></script>
  </body>
</html>
`;
}

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtml(value = '') {
  return escapeXml(value).replace(/'/g, '&#39;');
}

function escapeScriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
