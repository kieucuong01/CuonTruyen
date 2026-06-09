import { buildTagIndex, publicSeriesDetail } from './contentStore.mjs';

import { buildHomeCollections } from './contentStore.mjs';
import { slugify } from './utils.mjs';

const SITE_NAME = 'Cuộn Truyện';
const DEFAULT_TITLE = 'Cuộn Truyện - Đọc truyện tranh Manhwa, Manhua online miễn phí';
function readMonetizationConfig() {
  return {
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
  };
}

function monetizationConfigScript() {
  return `<script>window.COMIC_READER_CONFIG={...(window.COMIC_READER_CONFIG||{}),monetization:${escapeScriptJson(readMonetizationConfig())}};</script>`;
}

const DEFAULT_DESCRIPTION = 'Đọc truyện tranh Manhwa, Manhua, Manga online tại Cuộn Truyện: cập nhật nhanh, reader cuộn dọc mượt trên điện thoại và tự lưu vị trí đọc.';

const CONTROLLED_LANDING_PAGES = [
  {
    path: '/truyen-moi',
    title: 'Truyện mới cập nhật - Đọc chapter mới tại Cuộn Truyện',
    heading: 'Truyện mới cập nhật',
    description: 'Danh sách truyện tranh mới cập nhật trên Cuộn Truyện, ưu tiên các bộ đã public chapter đọc được và tối ưu trải nghiệm đọc dọc trên điện thoại.',
    mode: 'updated'
  },
  {
    path: '/truyen-hot',
    title: 'Truyện hot - Manhwa, Manhua đang được đọc nhiều',
    heading: 'Truyện hot',
    description: 'Khám phá các bộ Manhwa, Manhua và Manga nổi bật trên Cuộn Truyện, có chapter public và liên kết đọc tiếp nhanh.',
    mode: 'hot'
  },
  {
    path: '/manhwa',
    title: 'Manhwa - Truyện tranh Hàn Quốc online tại Cuộn Truyện',
    heading: 'Manhwa Hàn Quốc',
    description: 'Tuyển tập Manhwa Hàn Quốc đang có trên Cuộn Truyện, gồm nhiều bộ hành động, fantasy, học đường và chuyển sinh.',
    tagSlug: 'manhwa'
  },
  {
    path: '/manhua',
    title: 'Manhua - Truyện tranh Trung Quốc online tại Cuộn Truyện',
    heading: 'Manhua Trung Quốc',
    description: 'Đọc Manhua Trung Quốc online trên Cuộn Truyện với reader cuộn dọc, tự lưu vị trí và danh sách chapter dễ theo dõi.',
    tagSlug: 'manhua'
  },
  {
    path: '/truyen-tu-tien',
    title: 'Truyện tu tiên - Manhua tu luyện, huyền huyễn online',
    heading: 'Truyện tu tiên',
    description: 'Danh sách truyện tu tiên, tu luyện và huyền huyễn đang cập nhật trên Cuộn Truyện, phù hợp người thích đọc liền mạch nhiều chapter.',
    querySlugs: ['tu-tien', 'tu-luyen', 'huyen-huyen', 'vo-hiep']
  },
  {
    path: '/truyen-chuyen-sinh',
    title: 'Truyện chuyển sinh - Isekai, trọng sinh, hệ thống',
    heading: 'Truyện chuyển sinh',
    description: 'Tổng hợp truyện chuyển sinh, trọng sinh, isekai và hệ thống đang public trên Cuộn Truyện để đọc online trên điện thoại.',
    querySlugs: ['chuyen-sinh', 'trong-sinh', 'isekai', 'he-thong']
  }
];

export function tagSeoCopy(tag = {}) {
  const name = String(tag.name || tag.slug || 'truyện tranh').trim();
  const slug = String(tag.slug || '').trim();
  const catalog = {
    manhwa: {
      title: 'Truyện Manhwa Hàn Quốc - Đọc manhwa online tại Cuộn Truyện',
      description: 'Tuyển tập truyện Manhwa Hàn Quốc đang cập nhật trên Cuộn Truyện, tối ưu đọc dọc trên điện thoại, lưu lịch sử đọc và mở lại đúng chương.'
    },
    manhua: {
      title: 'Truyện Manhua - Đọc manhua Trung Quốc online tại Cuộn Truyện',
      description: 'Khám phá truyện Manhua Trung Quốc nhiều thể loại, cập nhật chương mới và đọc liền mạch trên Cuộn Truyện.'
    },
    'truyen-han': {
      title: 'Truyện Hàn Quốc - Manhwa mới cập nhật tại Cuộn Truyện',
      description: 'Danh sách truyện Hàn Quốc, manhwa hành động, fantasy, học đường và chuyển sinh được cập nhật để đọc online trên Cuộn Truyện.'
    },
    'truyen-trung': {
      title: 'Truyện Trung Quốc - Manhua mới cập nhật tại Cuộn Truyện',
      description: 'Danh sách truyện Trung Quốc, manhua tu tiên, võ hiệp, đô thị và hệ thống được cập nhật để đọc online trên Cuộn Truyện.'
    }
  };
  return catalog[slug] || {
    title: `Truyện ${name} - Đọc truyện tranh online tại Cuộn Truyện`,
    description: `Đọc truyện tranh thể loại ${name} online tại Cuộn Truyện, cập nhật chương mới, đọc dọc mượt và tự lưu vị trí đang đọc.`
  };
}

export function controlledLandingPages() {
  return CONTROLLED_LANDING_PAGES.map((page) => ({ ...page }));
}

export function siteJsonLd(baseUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: baseUrl,
    inLanguage: 'vi',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${baseUrl}/#/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string'
    }
  };
}

export function breadcrumbJsonLd(items = []) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url
    }))
  };
}

export const STATIC_PAGES = [
  {
    path: '/gioi-thieu',
    title: 'Giới thiệu Cuộn Truyện - Website đọc truyện tranh online tối ưu mobile',
    description: 'Cuộn Truyện là website đọc truyện tranh Manhwa, Manhua, Manga online với reader cuộn dọc mượt, cập nhật nhanh và tự lưu vị trí đọc.',
    heading: 'Giới thiệu Cuộn Truyện',
    body: 'Cuộn Truyện được xây dựng cho thói quen đọc truyện trên điện thoại: mở nhanh, cuộn dọc liên tục và quay lại đúng đoạn đang đọc. Website tập trung vào trải nghiệm đọc gọn, ít gián đoạn và dễ theo dõi các bộ Manhwa, Manhua, Manga đang cập nhật.',
    items: [
      'Reader cuộn dọc liền mạch, phù hợp màn hình điện thoại và thói quen đọc nhanh.',
      'Lịch sử đọc, theo dõi và vị trí đọc giúp bạn tiếp tục truyện không cần nhớ chương.',
      'Trang chủ, tìm kiếm và thể loại chỉ hiển thị nội dung đã được duyệt public.'
    ]
  },
  {
    path: '/lien-he',
    title: 'Liên hệ - Cuộn Truyện',
    description: 'Liên hệ Cuộn Truyện để báo lỗi ảnh, chapter thiếu, góp ý trải nghiệm đọc hoặc gửi yêu cầu xử lý nội dung.',
    heading: 'Liên hệ',
    body: 'Nếu bạn gặp ảnh lỗi, chapter thiếu, thông tin truyện chưa đúng hoặc muốn gửi yêu cầu xử lý nội dung, hãy liên hệ quản trị viên Cuộn Truyện. Càng có đủ đường dẫn truyện, chapter và mô tả lỗi, đội vận hành càng kiểm tra nhanh hơn.',
    items: [
      'Ghi rõ tên truyện, chapter và lỗi bạn gặp để đội vận hành kiểm tra nhanh hơn.',
      'Với yêu cầu gỡ bỏ nội dung, hãy gửi kèm đường dẫn và bằng chứng quyền sở hữu hợp lệ.',
      'Nội dung vi phạm có thể được ẩn khỏi public, reader, tìm kiếm, thể loại và sitemap.'
    ]
  },
  {
    path: '/chinh-sach-noi-dung',
    title: 'Chính sách nội dung và gỡ bỏ truyện - Cuộn Truyện',
    description: 'Chính sách nội dung Cuộn Truyện: kiểm duyệt public/draft/removed, tiếp nhận yêu cầu gỡ bỏ và ẩn truyện hoặc chapter khi cần.',
    heading: 'Chính sách nội dung',
    body: 'Cuộn Truyện ưu tiên vận hành minh bạch: nội dung chỉ nên được public khi phù hợp với quyền sử dụng và tiêu chuẩn kiểm duyệt của website. Khi có yêu cầu hợp lệ, quản trị viên có thể ẩn truyện hoặc chapter khỏi toàn bộ bề mặt public, bao gồm trang chủ, reader, tìm kiếm, thể loại và sitemap.',
    items: [
      'Chỉ truyện và chapter có trạng thái public mới được index trên website.',
      'Draft và removed không xuất hiện ở trang public, reader, search, tag hoặc sitemap.',
      'Yêu cầu takedown hợp lệ được xử lý bằng cách ẩn truyện/chapter trước, sau đó rà soát dữ liệu vận hành khi cần.'
    ]
  },
  {
    path: '/privacy',
    title: 'Chính sách riêng tư - Cách Cuộn Truyện lưu dữ liệu đọc',
    description: 'Cuộn Truyện ưu tiên lưu lịch sử đọc trên trình duyệt, dùng dữ liệu đăng nhập và analytics cơ bản để vận hành, bảo mật và cải thiện trải nghiệm.',
    heading: 'Chính sách riêng tư',
    body: 'Cuộn Truyện ưu tiên lưu tiến độ đọc ở phía trình duyệt để bạn có thể tiếp tục truyện nhanh mà không cần thao tác phức tạp. Khi dùng tài khoản hoặc tương tác với website, hệ thống có thể ghi nhận dữ liệu cần thiết để xác thực, chống lạm dụng, đo hiệu quả nội dung và cải thiện trải nghiệm.',
    items: [
      'Tiến độ đọc và danh sách theo dõi dùng localStorage theo từng trình duyệt.',
      'Khi đăng nhập, phiên truy cập dùng token server-issued để xác thực thao tác tài khoản.',
      'Sự kiện như lượt xem, click donate hoặc tương tác quảng cáo chỉ dùng cho vận hành và thống kê nội bộ.'
    ]
  }
];

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

export function tagPageJsonLd(page, baseUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Truyện ${page.tag.name}`,
    description: tagSeoCopy(page.tag).description,
    url: `${baseUrl}/the-loai/${page.tag.slug}`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: (page.series || []).slice(0, 20).map((series, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: series.title,
        url: `${baseUrl}/truyen/${series.slug}`
      }))
    }
  };
}

export function landingPageJsonLd(page, seriesList, baseUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: page.heading,
    description: page.description,
    url: `${baseUrl}${page.path}`,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: (seriesList || []).slice(0, 24).map((series, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: series.title,
        url: `${baseUrl}/truyen/${series.slug}`
      }))
    }
  };
}

export function selectLandingPageSeries(page = {}, seriesList = [], limit = 24) {
  const readableSeries = (seriesList || [])
    .map((series) => publicSeriesDetail(series))
    .filter((series) => series.status === 'public' && Number(series.importedChapterCount || series.chapterCount || 0) > 0);
  const selected = readableSeries.filter((series) => {
    if (page.mode === 'updated' || page.mode === 'hot') return true;
    const haystack = [
      series.slug,
      series.title,
      ...(series.aliases || []),
      ...(series.tags || []).flatMap((tag) => [tag.slug, tag.name])
    ].map(slugify).join(' ');
    if (page.tagSlug) return haystack.includes(slugify(page.tagSlug));
    return (page.querySlugs || []).some((querySlug) => haystack.includes(slugify(querySlug)));
  });
  const score = (series) => Number(series.stats?.views || 0) + Number(series.stats?.follows || 0) * 20;
  return [...selected].sort((a, b) => {
    if (page.mode === 'hot') return score(b) - score(a);
    return Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0);
  }).slice(0, limit);
}

export function findRelatedSeries(series, seriesList = [], limit = 6) {
  const tagSlugs = new Set((series?.tags || []).map((tag) => tag.slug).filter(Boolean));
  return (seriesList || [])
    .map((item) => publicSeriesDetail(item))
    .filter((item) => item.status === 'public' && item.slug !== series?.slug)
    .map((item) => ({
      ...item,
      relatedScore: (item.tags || []).filter((tag) => tagSlugs.has(tag.slug)).length
    }))
    .filter((item) => item.relatedScore > 0)
    .sort((a, b) => b.relatedScore - a.relatedScore || Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))
    .slice(0, limit);
}

export function buildSitemapXml(seriesList, tags, baseUrl, { staticPages = STATIC_PAGES } = {}) {
  const publicTags = (tags || []).filter((tag) => Number(tag.seriesCount || tag.count || 0) > 0);
  const urls = [
    { loc: baseUrl, lastmod: new Date().toISOString() },
    ...staticPages.map((page) => ({ loc: `${baseUrl}${page.path}` })),
    ...CONTROLLED_LANDING_PAGES.map((page) => ({ loc: `${baseUrl}${page.path}` })),
    ...seriesList.flatMap((series) => {
      const normalized = publicSeriesDetail(series);
      return [
        { loc: `${baseUrl}/truyen/${normalized.slug}`, lastmod: normalized.updatedAt },
        ...normalized.chapters
          .filter((chapter) => chapter.status === 'public' && (chapter.imported || chapter.pageCount > 0))
          .map((chapter) => ({
            loc: `${baseUrl}/truyen/${normalized.slug}/${chapter.slug}`,
            lastmod: chapter.updatedAt || normalized.updatedAt
          }))
      ];
    }),
    ...publicTags.map((tag) => ({ loc: `${baseUrl}/the-loai/${tag.slug}` }))
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((item) => `  <url>\n    <loc>${escapeXml(item.loc)}</loc>${item.lastmod ? `\n    <lastmod>${escapeXml(item.lastmod)}</lastmod>` : ''}\n  </url>`).join('\n')}\n</urlset>\n`;
}

export function buildRobotsTxt(baseUrl) {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /fallback-api/',
    'Allow: /imports/',
    `Sitemap: ${baseUrl}/sitemap.xml`,
    ''
  ].join('\n');
}

export function buildSiteMapFromCatalog(catalog, baseUrl) {
  const series = (catalog.series || [])
    .map(publicSeriesDetail)
    .filter((item) => item.status === 'public');
  return buildSitemapXml(series, buildTagIndex(catalog), baseUrl);
}

export function getStaticPage(pathname) {
  return STATIC_PAGES.find((page) => page.path === pathname) || null;
}

export function renderStaticPageShell(pathname, baseUrl) {
  const page = getStaticPage(pathname);
  if (!page) return null;
  return renderHtmlShell({
    title: page.title,
    description: page.description,
    canonicalUrl: `${baseUrl}${page.path}`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.heading,
      description: page.description,
      url: `${baseUrl}${page.path}`
    },
    bodyHtml: renderStaticBody(page)
  });
}

export function renderNotFoundShell(pathname, baseUrl) {
  return renderHtmlShell({
    title: 'Không tìm thấy trang - Cuộn Truyện',
    description: 'Trang bạn đang tìm không tồn tại hoặc nội dung đã được ẩn khỏi Cuộn Truyện.',
    canonicalUrl: `${baseUrl}${pathname}`,
    bodyHtml: renderStaticBody({
      heading: 'Không tìm thấy trang',
      body: 'Nội dung có thể đã bị ẩn, chưa được publish hoặc đường dẫn không còn hợp lệ.'
    })
  });
}

export function renderHomeSeoPage({ catalog = {}, tags = [] } = {}, baseUrl) {
  const collections = buildHomeCollections(catalog);
  const seriesList = [...(collections.updated || []), ...(collections.hot || [])]
    .filter((series, index, all) => all.findIndex((item) => item.slug === series.slug) === index)
    .slice(0, 18);
  const publicTags = (tags.length ? tags : collections.tags || [])
    .filter((tag) => Number(tag.seriesCount || tag.count || 0) > 0)
    .slice(0, 16);
  return renderHtmlShell({
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    canonicalUrl: baseUrl,
    jsonLd: siteJsonLd(baseUrl),
    bodyHtml: renderHomeBody(seriesList, publicTags)
  });
}

export function renderLandingSeoPage({ page = null, seriesList = [] } = {}, baseUrl) {
  if (!page) return null;
  return renderHtmlShell({
    title: page.title,
    description: page.description,
    canonicalUrl: `${baseUrl}${page.path}`,
    jsonLd: landingPageJsonLd(page, seriesList, baseUrl),
    bodyHtml: renderCollectionBody(page.heading, page.description, seriesList)
  });
}

export function renderTagSeoPage({ page = null } = {}, baseUrl) {
  if (!page) return null;
  const copy = tagSeoCopy(page.tag);
  return renderHtmlShell({
    title: copy.title,
    description: copy.description,
    canonicalUrl: `${baseUrl}/the-loai/${page.tag.slug}`,
    jsonLd: tagPageJsonLd(page, baseUrl),
    bodyHtml: renderCollectionBody(copy.title, copy.description, page.series || [])
  });
}

export function renderSeriesSeoPage({ series, relatedSeries = [] } = {}, baseUrl) {
  if (!series) return null;
  const title = `${series.title} - Đọc truyện tranh online tại Cuộn Truyện`;
  const description = series.description || `Đọc ${series.title} online tại Cuộn Truyện, reader cuộn dọc mượt, tự lưu vị trí và mở lại đúng chương đang đọc.`;
  return renderHtmlShell({
    title,
    description,
    canonicalUrl: `${baseUrl}/truyen/${series.slug}`,
    imageUrl: absoluteUrl(series.coverUrl || series.thumbnailUrl, baseUrl),
    jsonLd: [
      seriesJsonLd(series, baseUrl),
      breadcrumbJsonLd([
        { name: 'Trang chủ', url: `${baseUrl}/` },
        { name: series.title, url: `${baseUrl}/truyen/${series.slug}` }
      ])
    ],
    bodyHtml: renderSeriesBody(series, description, relatedSeries)
  });
}

export function renderChapterSeoPage({ series, chapter } = {}, baseUrl) {
  if (!series || !chapter) return null;
  const chapterTitle = chapter.title || chapter.label || chapter.slug || 'Chapter';
  const title = `${series.title} - ${chapterTitle} | Cuộn Truyện`;
  const description = `Đọc ${series.title} ${chapterTitle} online tại Cuộn Truyện với ảnh tải nhanh, đọc dọc liền mạch và tự lưu tiến độ.`;
  const imageUrl = absoluteUrl(chapter.pages?.[0]?.imageUrl || series.coverUrl || series.thumbnailUrl, baseUrl);
  return renderHtmlShell({
    title,
    description,
    canonicalUrl: `${baseUrl}/truyen/${series.slug}/${chapter.slug}`,
    imageUrl,
    jsonLd: [
      chapterJsonLd(series, chapter, baseUrl),
      breadcrumbJsonLd([
        { name: 'Trang chủ', url: `${baseUrl}/` },
        { name: series.title, url: `${baseUrl}/truyen/${series.slug}` },
        { name: chapterTitle, url: `${baseUrl}/truyen/${series.slug}/${chapter.slug}` }
      ])
    ],
    bodyHtml: renderChapterBody(series, chapter, description)
  });
}

export function renderHtmlShell({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  canonicalUrl = '',
  imageUrl = '',
  jsonLd = null,
  bodyHtml = '<div id="app"></div>'
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
    <meta name="theme-color" content="#ff8b2b">
    ${safeCanonical ? `<link rel="canonical" href="${safeCanonical}">` : ''}
    <meta property="og:site_name" content="${SITE_NAME}">
    <meta property="og:title" content="${safeTitle}">
    <meta property="og:description" content="${safeDescription}">
    <meta property="og:type" content="website">
    ${safeCanonical ? `<meta property="og:url" content="${safeCanonical}">` : ''}
    ${safeImage ? `<meta property="og:image" content="${safeImage}">` : ''}
    ${safeImage ? '<meta name="twitter:card" content="summary_large_image">' : '<meta name="twitter:card" content="summary">'}
    <meta name="twitter:title" content="${safeTitle}">
    <meta name="twitter:description" content="${safeDescription}">
    ${safeImage ? `<meta name="twitter:image" content="${safeImage}">` : ''}
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="manifest" href="/site.webmanifest" />
    <link rel="stylesheet" href="/styles.css" />
    ${jsonLd ? `<script type="application/ld+json">${escapeScriptJson(jsonLd)}</script>` : ''}
  </head>
  <body>
    ${bodyHtml}
    <script src="/config.js"></script>
    ${monetizationConfigScript()}
  <script type="module" src="/app.js"></script>
  </body>
</html>
`;
}

function renderStaticBody(page) {
  const items = (page.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  return `
    <main id="app" class="site-shell static-page">
      <section class="page-heading static-page-heading">
        <h1>${escapeHtml(page.heading)}</h1>
        <p>${escapeHtml(page.body)}</p>
      </section>
      ${items ? `<section class="static-info-panel"><ul>${items}</ul></section>` : ''}
    </main>
  `;
}

function renderHomeBody(seriesList, tags) {
  const landingLinks = CONTROLLED_LANDING_PAGES.map((page) => `<li><a href="${escapeHtml(page.path)}">${escapeHtml(page.heading)}</a></li>`).join('');
  const tagLinks = (tags || []).map((tag) => `<li><a href="/the-loai/${escapeHtml(tag.slug)}">${escapeHtml(tag.name)}</a></li>`).join('');
  return `
    <main id="app" class="site-shell static-page">
      <section class="page-heading static-page-heading">
        <h1>Cuộn Truyện - đọc Manhwa, Manhua online</h1>
        <p>${escapeHtml(DEFAULT_DESCRIPTION)}</p>
      </section>
      <section class="static-info-panel">
        <h2>Lối vào nhanh</h2>
        <ul>${landingLinks}</ul>
      </section>
      ${tagLinks ? `<section class="static-info-panel"><h2>Thể loại nổi bật</h2><ul>${tagLinks}</ul></section>` : ''}
      ${renderSeriesListSection('Truyện đang cập nhật', seriesList)}
    </main>
  `;
}

function renderCollectionBody(heading, description, seriesList) {
  return `
    <main id="app" class="site-shell static-page">
      <section class="page-heading static-page-heading">
        <h1>${escapeHtml(heading)}</h1>
        <p>${escapeHtml(description)}</p>
      </section>
      ${renderSeriesListSection('Danh sách truyện', seriesList)}
    </main>
  `;
}

function renderSeriesBody(series, description, relatedSeries) {
  const tagLinks = (series.tags || []).map((tag) => `<li><a href="/the-loai/${escapeHtml(tag.slug)}">${escapeHtml(tag.name)}</a></li>`).join('');
  const chapterLinks = (series.chapters || [])
    .filter((chapter) => chapter.status === 'public' && (chapter.imported || chapter.pageCount > 0))
    .slice(0, 24)
    .map((chapter) => `<li><a href="/truyen/${escapeHtml(series.slug)}/${escapeHtml(chapter.slug)}">${escapeHtml(chapter.title || chapter.label || chapter.slug)}</a></li>`)
    .join('');
  return `
    <main id="app" class="site-shell static-page">
      <section class="page-heading static-page-heading">
        <h1>${escapeHtml(series.title)}</h1>
        <p>${escapeHtml(description)}</p>
      </section>
      ${tagLinks ? `<section class="static-info-panel"><h2>Thể loại</h2><ul>${tagLinks}</ul></section>` : ''}
      ${chapterLinks ? `<section class="static-info-panel"><h2>Chapter mới</h2><ul>${chapterLinks}</ul></section>` : ''}
      ${renderSeriesListSection('Truyện liên quan', relatedSeries)}
    </main>
  `;
}

function renderChapterBody(series, chapter, description) {
  const previewPages = (chapter.pages || []).length
    ? (chapter.pages || []).slice(0, 3)
    : [{ imageUrl: series.coverUrl || series.thumbnailUrl || '' }];
  const pages = previewPages.map((page, index) => {
    const pageUrl = page.imageUrl || page.src || '';
    if (!pageUrl) return '';
    const alt = `${series.title} ${chapter.title || chapter.label || chapter.slug} trang ${index + 1}`;
    return `<img src="${escapeHtml(pageUrl)}" alt="${escapeHtml(alt)}" loading="${index === 0 ? 'eager' : 'lazy'}">`;
  }).join('');
  return `
    <main id="app" class="site-shell static-page">
      <section class="page-heading static-page-heading">
        <h1>${escapeHtml(series.title)} - ${escapeHtml(chapter.title || chapter.label || chapter.slug)}</h1>
        <p>${escapeHtml(description)}</p>
      </section>
      ${pages ? `<section class="static-info-panel static-reader-preview">${pages}</section>` : ''}
      <section class="static-info-panel">
        <a href="/truyen/${escapeHtml(series.slug)}">Xem danh sách chapter ${escapeHtml(series.title)}</a>
      </section>
    </main>
  `;
}

function renderSeriesListSection(heading, seriesList = []) {
  const links = (seriesList || [])
    .map((series) => `<li><a href="/truyen/${escapeHtml(series.slug)}">${escapeHtml(series.title)}</a>${series.chapterCount ? ` <span>${Number(series.importedChapterCount || series.chapterCount)} chapter</span>` : ''}</li>`)
    .join('');
  if (!links) return '';
  return `<section class="static-info-panel"><h2>${escapeHtml(heading)}</h2><ul>${links}</ul></section>`;
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
