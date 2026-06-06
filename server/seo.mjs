import { buildTagIndex, publicSeriesDetail } from './contentStore.mjs';

const SITE_NAME = 'Cuộn Truyện';
const DEFAULT_TITLE = 'Cuộn Truyện - Đọc truyện tranh manhwa, manhua online liền mạch';
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

const DEFAULT_DESCRIPTION = 'Cuộn Truyện giúp đọc truyện tranh manhwa, manhua, manga online liền mạch, tải nhanh và tự lưu đúng vị trí đang đọc.';

export const STATIC_PAGES = [
  {
    path: '/gioi-thieu',
    title: 'Giới thiệu Cuộn Truyện - Trình đọc truyện tranh liền mạch',
    description: 'Cuộn Truyện là website đọc truyện tranh manhwa, manhua online tối ưu cho mobile, cuộn chapter liền mạch và tự lưu vị trí đọc.',
    heading: 'Giới thiệu Cuộn Truyện',
    body: 'Cuộn Truyện tập trung vào một việc: giúp người đọc truyện tranh trên điện thoại nhanh, gọn và ít bị ngắt mạch. Trải nghiệm chính là đọc liên tục giữa các chapter, mở lại đúng vị trí đang đọc và tìm nhanh các bộ manhwa, manhua đang cập nhật.',
    items: [
      'Reader cuộn dọc liền mạch, phù hợp thói quen đọc truyện trên điện thoại.',
      'Lịch sử đọc, theo dõi và vị trí đọc được lưu để bạn quay lại nhanh hơn.',
      'Chỉ nội dung public mới xuất hiện trên trang chủ, tìm kiếm, thể loại và sitemap.'
    ]
  },
  {
    path: '/lien-he',
    title: 'Liên hệ - Cuộn Truyện',
    description: 'Liên hệ Cuộn Truyện để báo lỗi ảnh, góp ý trải nghiệm đọc hoặc gửi yêu cầu xử lý nội dung.',
    heading: 'Liên hệ',
    body: 'Nếu bạn gặp ảnh lỗi, chapter thiếu, thông tin truyện chưa đúng hoặc cần gửi yêu cầu xử lý nội dung, hãy liên hệ quản trị viên Cuộn Truyện qua kênh liên hệ được công bố trên website.',
    items: [
      'Ghi rõ tên truyện, chapter và lỗi bạn gặp để đội vận hành kiểm tra nhanh hơn.',
      'Với yêu cầu gỡ bỏ nội dung, hãy gửi kèm đường dẫn và bằng chứng quyền sở hữu hợp lệ.',
      'Nội dung vi phạm có thể được ẩn khỏi public, reader, tìm kiếm, thể loại và sitemap.'
    ]
  },
  {
    path: '/chinh-sach-noi-dung',
    title: 'Chính sách nội dung và gỡ bỏ - Cuộn Truyện',
    description: 'Chính sách nội dung của Cuộn Truyện: quản trị viên có thể ẩn truyện, ẩn chapter và xử lý yêu cầu gỡ bỏ.',
    heading: 'Chính sách nội dung',
    body: 'Cuộn Truyện chỉ nên vận hành với nguồn nội dung mà chủ sở hữu website được phép sử dụng. Khi có yêu cầu hợp lệ, quản trị viên có thể ẩn truyện hoặc chapter khỏi toàn bộ bề mặt public và sitemap.',
    items: [
      'Chỉ truyện và chapter có trạng thái public mới được index trên website.',
      'Draft và removed không xuất hiện ở trang public, reader, search, tag hoặc sitemap.',
      'Yêu cầu takedown hợp lệ được xử lý bằng cách ẩn truyện/chapter trước, sau đó rà soát dữ liệu vận hành khi cần.'
    ]
  },
  {
    path: '/privacy',
    title: 'Chính sách riêng tư - Cuộn Truyện',
    description: 'Cuộn Truyện lưu lịch sử đọc chủ yếu trên trình duyệt và chỉ dùng dữ liệu tương tác để vận hành, bảo mật, cải thiện trải nghiệm.',
    heading: 'Chính sách riêng tư',
    body: 'Cuộn Truyện ưu tiên lưu dữ liệu đọc ở phía trình duyệt để trải nghiệm nhanh và ít phụ thuộc tài khoản. Website có thể ghi nhận sự kiện cơ bản để vận hành, chống lạm dụng, đo hiệu quả nội dung và cải thiện sản phẩm.',
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
    description: `Danh sách truyện tranh ${page.tag.name} đang được cập nhật trên Cuộn Truyện.`,
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

export function buildSitemapXml(seriesList, tags, baseUrl, { staticPages = STATIC_PAGES } = {}) {
  const publicTags = (tags || []).filter((tag) => Number(tag.seriesCount || tag.count || 0) > 0);
  const urls = [
    { loc: baseUrl, lastmod: new Date().toISOString() },
    ...staticPages.map((page) => ({ loc: `${baseUrl}${page.path}` })),
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
    'Disallow: /static-api/',
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
    ${safeImage ? `<meta property="og:image" content="${safeImage}">` : ''}
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
