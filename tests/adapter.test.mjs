import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractChapterImages,
  parseSeriesPage,
  resolveUrl
} from '../server/adapters/manhuarock.mjs';

test('resolveUrl turns root-relative and protocol-relative paths into absolute URLs', () => {
  const base = 'https://manhuarock4.site/truyen-tranh/demo.html';

  assert.equal(resolveUrl('/chapter-1', base), 'https://manhuarock4.site/chapter-1');
  assert.equal(resolveUrl('//cdn.example.com/page.jpg', base), 'https://cdn.example.com/page.jpg');
  assert.equal(resolveUrl('https://other.test/a.png', base), 'https://other.test/a.png');
});

test('parseSeriesPage extracts title, cover, and ordered chapter links', () => {
  const html = `
    <html>
      <head><title>Demo Comic - Manhuarock</title></head>
      <body>
        <h1>Demo Comic</h1>
        <img class="cover" src="/covers/demo.jpg" />
        <a href="/truyen-tranh/demo/2">Chapter 2</a>
        <a href="/truyen-tranh/demo/1">Chapter 1</a>
        <a href="/the-loai/action">Action</a>
      </body>
    </html>
  `;

  const result = parseSeriesPage(html, 'https://manhuarock4.site/truyen-tranh/demo.html');

  assert.equal(result.title, 'Demo Comic');
  assert.equal(result.coverUrl, 'https://manhuarock4.site/covers/demo.jpg');
  assert.deepEqual(result.chapters.map((chapter) => chapter.label), ['Chapter 1', 'Chapter 2']);
  assert.deepEqual(result.chapters.map((chapter) => chapter.url), [
    'https://manhuarock4.site/truyen-tranh/demo/1',
    'https://manhuarock4.site/truyen-tranh/demo/2'
  ]);
});

test('parseSeriesPage ignores chapter-looking links from other series', () => {
  const html = `
    <h1>Demo Comic</h1>
    <a href="/truyen-tranh/other-comic/chap-99.html">Chapter 99</a>
    <a href="/truyen-tranh/demo-comic/chap-1.html">Chapter 1</a>
    <a href="/truyen-tranh/demo-comic/chap-2.html">Chapter 2</a>
  `;

  const result = parseSeriesPage(html, 'https://manhuarock4.site/truyen-tranh/demo-comic.html');

  assert.deepEqual(result.chapters.map((chapter) => chapter.url), [
    'https://manhuarock4.site/truyen-tranh/demo-comic/chap-1.html',
    'https://manhuarock4.site/truyen-tranh/demo-comic/chap-2.html'
  ]);
});

test('extractChapterImages returns likely comic page images without duplicates', () => {
  const html = `
    <main>
      <img src="/logo.png" />
      <img data-src="/chapter/1/page-001.jpg" />
      <img src="/chapter/1/page-002.webp" />
      <img data-original="//cdn.example.com/chapter/1/page-002.webp" />
      <img src="/ads/banner.gif" />
    </main>
  `;

  const images = extractChapterImages(html, 'https://manhuarock4.site/truyen-tranh/demo/1');

  assert.deepEqual(images, [
    'https://manhuarock4.site/chapter/1/page-001.jpg',
    'https://manhuarock4.site/chapter/1/page-002.webp',
    'https://cdn.example.com/chapter/1/page-002.webp'
  ]);
});
