import { buildTagIndex, publicSeriesDetail } from './contentStore.mjs';

const SITE_NAME = 'Cuộn Truyện';
const DEFAULT_TITLE = 'Cuộn Truyện - Đọc truyện tranh manhwa, manhua online liền mạch';
function readMonetizationConfig() {
  return {
    adsEnabled: process.env.ADS_ENABLED !== 'false',
    donateUrl: process.env.DONATE_URL || ''
  };
}

function monetizationConfigScript() {
  return `<script>window.COMIC_READER_CONFIG=${escapeScriptJson({ monetization: readMonetizationConfig() })};</script>`;
}

const DEFAULT_DESCRIPTION = 'Cuộn Truyện giúp đọc truyện tranh manhwa, manhua, manga online liền mạch, tải nhanh và tự lưu đúng vị trí đang đọc.';

export const STATIC_PAGES = [
  {
    path: '/gioi-thieu',
    title: 'Giới thiệu Cuộn Truyện - Trình đọc truyện tranh liền mạch',
    description: 'Cuộn Truyện tập trung vào trải nghiệm đọc truyện tranh online mượt, nối chapter liên tục và tự lưu vị trí đọc trên trình duyệt.',
    heading: 'Giới thiệu Cuộn Truyện',
    body: 'Cuộn Truyện là website đọc truyện tranh tối ưu cho trải nghiệm cuộn liên tục, giúp bạn mở lại đúng bộ đang đọc và theo dõi lịch sử ngay trên trình duyệt.',
    items: [
      'Đọc liền mạch nhiều chapter mà không phải bấm chuyển trang.',
      'Tự lưu lịch sử, danh sách theo dõi và vị trí đọc trên trình duyệt.',
      'Chỉ hiển thị nội dung đã được quản trị viên publish ra public.'
    ]
  },
  {
    path: '/lien-he',
    title: 'Liên hệ - Cuộn Truyện',
    description: 'Liên hệ Cuộn Truyện để báo lỗi truyện, góp ý trải nghiệm đọc hoặc yêu cầu xử lý nội dung.',
    heading: 'Liên hệ',
    body: 'Nếu bạn thấy truyện lỗi ảnh, sai thông tin hoặc cần gửi yêu cầu xử lý nội dung, hãy liên hệ quản trị viên Cuộn Truyện qua kênh liên hệ được công bố trên website.',
    items: [
      'Ghi rõ tên truyện, chapter và lỗi bạn gặp để đội vận hành kiểm tra nhanh hơn.',
      'Với yêu cầu gỡ bỏ nội dung, hãy gửi kèm đường dẫn và bằng chứng quyền sở hữu hợp lệ.',
      'Các nội dung vi phạm có thể được chuyển sang trạng thái removed và biến mất khỏi public/sitemap.'
    ]
  },
  {
    path: '/chinh-sach-noi-dung',
    title: 'Chính sách nội dung và gỡ bỏ - Cuộn Truyện',
    description: 'Chính sách nội dung của Cuộn Truyện: quản trị viên có thể ẩn truyện, ẩn chapter và xử lý yêu cầu gỡ bỏ.',
    heading: 'Chính sách nội dung',
    body: 'Cuộn Truyện chỉ nên vận hành với nguồn nội dung chủ sở hữu được phép sử dụng. Khi có yêu cầu hợp lệ, quản trị viên có thể ẩn truyện hoặc chapter khỏi trang public và sitemap.',
    items: [
      'Nội dung mới sau khi crawl mặc định ở trạng thái draft để chờ review.',
      'Draft và removed không xuất hiện ở trang public, reader, search, tag hoặc sitemap.',
      'Takedown hợp lệ được xử lý bằng cách ẩn truyện/chapter thay vì xóa dữ liệu vận hành ngay lập tức.'
    ]
  },
  {
    path: '/privacy',
    title: 'Privacy - Cuộn Truyện',
    description: 'Cuộn Truyện lưu lịch sử đọc và theo dõi chủ yếu trên trình duyệt của người dùng; sự kiện đọc được dùng để cải thiện trải nghiệm.',
    heading: 'Privacy',
    body: 'Lịch sử đọc, danh sách theo dõi và vị trí đọc được lưu trên trình duyệt. Website có thể ghi nhận sự kiện như lượt xem, độ sâu đọc và tương tác để cải thiện sản phẩm.',
    items: [
      'Tiến độ đọc và danh sách theo dõi dùng localStorage theo từng trình duyệt.',
      'Khi đăng nhập, phiên đọc có token server-issued để đồng bộ các thao tác tài khoản.',
      'Sự kiện như lượt xem, click donate hoặc độ sâu đọc chỉ dùng để cải thiện sản phẩm.'
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

export function buildSitemapXml(seriesList, tags, baseUrl, { staticPages = STATIC_PAGES } = {}) {
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
