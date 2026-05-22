import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSitemapXml, chapterJsonLd, renderHtmlShell, seriesJsonLd } from '../server/seo.mjs';

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
      updatedAt: '2026-05-22T08:00:00.000Z',
      pages: [{ imageUrl: '/imports/page-1.jpg' }]
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
  const xml = buildSitemapXml([series], [{ slug: 'manhua' }], 'https://example.com');

  assert.match(xml, /<loc>https:\/\/example.com\/truyen\/manh-nhat-lich-su<\/loc>/);
  assert.match(xml, /<loc>https:\/\/example.com\/truyen\/manh-nhat-lich-su\/chapter-1<\/loc>/);
  assert.match(xml, /<loc>https:\/\/example.com\/the-loai\/manhua<\/loc>/);
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
  assert.match(html, /application\/ld\+json/);
});
