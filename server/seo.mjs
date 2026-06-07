import { buildTagIndex, publicSeriesDetail } from './contentStore.mjs';

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
