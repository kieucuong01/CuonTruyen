import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isStandaloneBoundaryAdPage,
  publicReaderChapter,
  sanitizeReaderPages
} from '../server/contentStore.mjs';

test('sanitizeReaderPages drops wide standalone ad pages only at chapter boundaries', () => {
  const pages = [
    { imageUrl: '/001.webp', width: 900, height: 432 },
    { imageUrl: '/002.webp', width: 900, height: 1400 },
    { imageUrl: '/003.webp', width: 900, height: 1200 },
    { imageUrl: '/004.webp', width: 900, height: 432 }
  ];

  assert.deepEqual(
    sanitizeReaderPages(pages).map((page) => page.imageUrl),
    ['/002.webp', '/003.webp']
  );
});

test('sanitizeReaderPages keeps tall boundary images because they can contain comic panels', () => {
  const pages = [
    { imageUrl: '/001.webp', width: 690, height: 2600 },
    { imageUrl: '/002.webp', width: 690, height: 1400 },
    { imageUrl: '/003.webp', width: 690, height: 2400 }
  ];

  assert.equal(sanitizeReaderPages(pages).length, 3);
});

test('sanitizeReaderPages keeps wide images in the middle of a chapter', () => {
  const pages = [
    { imageUrl: '/001.webp', width: 900, height: 1400 },
    { imageUrl: '/002.webp', width: 900, height: 432 },
    { imageUrl: '/003.webp', width: 900, height: 1400 }
  ];

  assert.equal(isStandaloneBoundaryAdPage(pages[1], 1, pages.length), false);
  assert.equal(sanitizeReaderPages(pages).length, 3);
});

test('publicReaderChapter reports sanitized page count for the reader payload', () => {
  const chapter = publicReaderChapter({
    id: 'chapter-1',
    label: 'Chapter 1',
    pages: [
      { imageUrl: '/001.webp', width: 900, height: 432 },
      { imageUrl: '/002.webp', width: 900, height: 1400 },
      { imageUrl: '/003.webp', width: 900, height: 432 }
    ]
  });

  assert.equal(chapter.pageCount, 1);
  assert.deepEqual(chapter.pages.map((page) => page.imageUrl), ['/002.webp']);
});

test('publicReaderChapter strips crawler-only page fields from reader payload', () => {
  const chapter = publicReaderChapter({
    id: 'chapter-1',
    label: 'Chapter 1',
    pages: [
      {
        imageUrl: '/imports/demo/chapter-1/001.webp',
        src: '/imports/demo/chapter-1/001.webp',
        storageKey: '/imports/demo/chapter-1/001.webp',
        sourceUrl: 'https://source.example/001.jpg',
        originalBytes: 123456,
        storedBytes: 45678,
        width: 900,
        height: 1300
      }
    ]
  });

  assert.deepEqual(Object.keys(chapter.pages[0]).sort(), ['height', 'imageUrl', 'order', 'width']);
  assert.equal(chapter.pages[0].imageUrl, '/imports/demo/chapter-1/001.webp');
});
