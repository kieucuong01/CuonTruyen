import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRobotsTxt,
  buildSitemapXml,
  chapterJsonLd,
  renderHtmlShell,
  renderNotFoundShell,
  renderStaticPageShell,
  seriesJsonLd,
  tagPageJsonLd,
  tagSeoCopy
} from '../server/seo.mjs';

const series = {
  title: 'Mạnh Nhất Lịch Sử',
  slug: 'manh-nhat-lich-su',
  description: 'Một bộ manhua hành động.',
  coverUrl: '/imports/cover.jpg',
  updatedAt: '2026-05-22T08:00:00.000Z',
  chapters: [
    {
      title: 'Chapter 1',
      slug: 'chapter-1',
      status: 'public',
      updatedAt: '2026-05-22T08:00:00.000Z',
      pages: [{ imageUrl: '/imports/page-1.jpg' }]
    },
    {
      title: 'Chapter 2',
      slug: 'chapter-2',
      status: 'removed',
      updatedAt: '2026-05-22T08:00:00.000Z',
      pages: [{ imageUrl: '/imports/page-2.jpg' }]
    }
  ],
  tags: [{ name: 'Manhua', slug: 'manhua' }]
};

test('seriesJsonLd emits a Vietnamese comic series schema payload', () => {
  const payload = seriesJsonLd(series, 'https://example.com');

  assert.equal(payload['@type'], 'ComicSeries');
  assert.equal(payload.name, 'Mạnh Nhất Lịch Sử');
  assert.equal(payload.url, 'https://example.com/truyen/manh-nhat-lich-su');
  assert.equal(payload.genre[0], 'Manhua');
});

test('chapterJsonLd links chapter to the parent series', () => {
  const payload = chapterJsonLd(series, series.chapters[0], 'https://example.com');

  assert.equal(payload['@type'], 'ComicIssue');
  assert.equal(payload.isPartOf.name, 'Mạnh Nhất Lịch Sử');
  assert.equal(payload.url, 'https://example.com/truyen/manh-nhat-lich-su/chapter-1');
});

test('buildSitemapXml includes series, chapter, and tag URLs', () => {
  const xml = buildSitemapXml([series], [{ slug: 'manhua', seriesCount: 1 }, { slug: 'empty', seriesCount: 0 }], 'https://example.com');

  assert.match(xml, /<loc>https:\/\/example.com\/gioi-thieu<\/loc>/);
  assert.match(xml, /<loc>https:\/\/example.com\/truyen\/manh-nhat-lich-su<\/loc>/);
  assert.match(xml, /<loc>https:\/\/example.com\/truyen\/manh-nhat-lich-su\/chapter-1<\/loc>/);
  assert.doesNotMatch(xml, /chapter-2/);
  assert.match(xml, /<loc>https:\/\/example.com\/the-loai\/manhua<\/loc>/);
  assert.doesNotMatch(xml, /\/the-loai\/empty/);
});

test('buildRobotsTxt allows public pages but blocks admin and JSON surfaces', () => {
  const robots = buildRobotsTxt('https://example.com');

  assert.match(robots, /Allow: \//);
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Disallow: \/static-api\//);
  assert.match(robots, /Sitemap: https:\/\/example.com\/sitemap\.xml/);
});

test('tagSeoCopy gives production copy for origin landing pages', () => {
  assert.match(tagSeoCopy({ name: 'Manhwa', slug: 'manhwa' }).title, /Manhwa Hàn Quốc/);
  assert.match(tagSeoCopy({ name: 'Manhua', slug: 'manhua' }).description, /Manhua Trung Quốc/);
  assert.match(tagSeoCopy({ name: 'Fantasy', slug: 'fantasy' }).description, /đọc dọc mượt/);
});

test('tagPageJsonLd emits a crawlable collection page payload', () => {
  const payload = tagPageJsonLd({
    tag: { name: 'Truyện Manhua', slug: 'manhua' },
    series: [series]
  }, 'https://example.com');

  assert.equal(payload['@type'], 'CollectionPage');
  assert.equal(payload.url, 'https://example.com/the-loai/manhua');
  assert.equal(payload.description, tagSeoCopy({ name: 'Truyện Manhua', slug: 'manhua' }).description);
  assert.equal(payload.mainEntity.itemListElement[0].url, 'https://example.com/truyen/manh-nhat-lich-su');
});

test('renderStaticPageShell emits crawlable static policy pages', () => {
  const html = renderStaticPageShell('/chinh-sach-noi-dung', 'https://example.com');

  assert.match(html, /<title>Chính sách nội dung và gỡ bỏ truyện - Cuộn Truyện<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example.com\/chinh-sach-noi-dung">/);
  assert.match(html, /public\/draft\/removed/);
});

test('renderStaticPageShell emits production homepage-adjacent copy for intro and privacy pages', () => {
  const intro = renderStaticPageShell('/gioi-thieu', 'https://example.com');
  const privacy = renderStaticPageShell('/privacy', 'https://example.com');

  assert.match(intro, /Website đọc truyện tranh online tối ưu mobile/);
  assert.match(intro, /reader cuộn dọc mượt/);
  assert.match(privacy, /Cách Cuộn Truyện lưu dữ liệu đọc/);
  assert.match(privacy, /localStorage/);
});

test('renderNotFoundShell emits clean 404 metadata', () => {
  const html = renderNotFoundShell('/truyen/khong-co', 'https://example.com');

  assert.match(html, /<title>Không tìm thấy trang - Cuộn Truyện<\/title>/);
  assert.match(html, /Nội dung có thể đã bị ẩn/);
});

test('renderHtmlShell injects crawlable metadata and JSON-LD', () => {
  const html = renderHtmlShell({
    title: 'Mạnh Nhất Lịch Sử',
    description: 'Một bộ manhua hành động.',
    canonicalUrl: 'https://example.com/truyen/manh-nhat-lich-su',
    imageUrl: 'https://example.com/imports/cover.jpg',
    jsonLd: seriesJsonLd(series, 'https://example.com')
  });

  assert.match(html, /<title>Mạnh Nhất Lịch Sử<\/title>/);
  assert.match(html, /<meta name="description" content="Một bộ manhua hành động.">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example.com\/truyen\/manh-nhat-lich-su">/);
  assert.match(html, /<meta property="og:site_name" content="Cuộn Truyện">/);
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/favicon.svg" \/>/);
  assert.match(html, /application\/ld\+json/);
});
