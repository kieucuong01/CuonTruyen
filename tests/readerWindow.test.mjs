import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countReaderPages,
  findNewReaderChapters,
  mergeReaderChapters,
  releaseReaderImageElement,
  resolveReaderImageRetry,
  resolveChapterMenuScrollTop,
  resolveReaderToolbarVisibility,
  resolveReaderCurrentChapterId
} from '../public/readerWindow.mjs';

const catalogOrder = [
  { id: 'chapter-1' },
  { id: 'chapter-2' },
  { id: 'chapter-3' },
  { id: 'chapter-4' }
];

test('mergeReaderChapters keeps catalog order when appending next chapters', () => {
  const merged = mergeReaderChapters(
    [{ id: 'chapter-1' }, { id: 'chapter-3' }],
    [{ id: 'chapter-2' }],
    catalogOrder
  );

  assert.deepEqual(merged.map((chapter) => chapter.id), ['chapter-1', 'chapter-2', 'chapter-3']);
});

test('mergeReaderChapters replaces an existing chapter without duplicating it', () => {
  const merged = mergeReaderChapters(
    [{ id: 'chapter-1', pages: [{ order: 0 }] }],
    [{ id: 'chapter-1', pages: [{ order: 0 }, { order: 1 }] }],
    catalogOrder
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].pages.length, 2);
});

test('findNewReaderChapters returns only chapters that need DOM append', () => {
  const added = findNewReaderChapters(
    [{ id: 'chapter-1' }, { id: 'chapter-2' }],
    [{ id: 'chapter-2' }, { id: 'chapter-3' }]
  );

  assert.deepEqual(added.map((chapter) => chapter.id), ['chapter-3']);
});

test('countReaderPages summarizes current DOM pressure', () => {
  assert.equal(countReaderPages([
    { id: 'chapter-1', pages: [{}, {}, {}] },
    { id: 'chapter-2', pages: [{}, {}] }
  ]), 5);
});

test('resolveReaderCurrentChapterId preserves current chapter while preloading next', () => {
  assert.equal(resolveReaderCurrentChapterId({
    requestedId: '',
    currentId: 'chapter-1',
    payloadChapterId: 'chapter-2',
    firstLoadedId: 'chapter-1'
  }), 'chapter-1');
});

test('resolveChapterMenuScrollTop centers the active chapter inside the menu', () => {
  assert.equal(resolveChapterMenuScrollTop({
    itemOffsetTop: 1200,
    itemHeight: 48,
    listHeight: 480,
    maxScrollTop: 1400
  }), 984);

  assert.equal(resolveChapterMenuScrollTop({
    itemOffsetTop: 40,
    itemHeight: 48,
    listHeight: 480,
    maxScrollTop: 1400
  }), 0);

  assert.equal(resolveChapterMenuScrollTop({
    itemOffsetTop: 1800,
    itemHeight: 48,
    listHeight: 480,
    maxScrollTop: 1400
  }), 1400);
});

test('releaseReaderImageElement keeps the measured image height before blanking src', () => {
  const image = {
    currentSrc: 'https://cdn.example.com/page-1.jpg',
    dataset: {},
    loading: 'eager',
    style: {},
    _src: 'https://cdn.example.com/page-1.jpg',
    get src() {
      return this._src;
    },
    set src(value) {
      this._src = value;
    },
    getAttribute(name) {
      return name === 'src' ? this._src : '';
    },
    getBoundingClientRect() {
      return { height: 612.4, width: 390 };
    }
  };

  const released = releaseReaderImageElement(image, 'data:image/gif;base64,blank');

  assert.equal(released, true);
  assert.equal(image.dataset.readerSrc, 'https://cdn.example.com/page-1.jpg');
  assert.equal(image.style.height, '612px');
  assert.equal(image.src, 'data:image/gif;base64,blank');
  assert.equal(image.loading, 'lazy');
});

test('resolveReaderImageRetry retries failed reader images with a cache buster', () => {
  const retry = resolveReaderImageRetry({
    source: 'https://cdn.example.com/page-1.webp?size=large#panel',
    currentAttempt: 1,
    now: 123456
  });

  assert.equal(retry.canRetry, true);
  assert.equal(retry.attempt, 2);
  assert.equal(retry.delayMs, 1200);
  assert.equal(retry.src, 'https://cdn.example.com/page-1.webp?size=large&readerRetry=2-123456#panel');
});

test('resolveReaderImageRetry stops after the reader image retry budget', () => {
  const retry = resolveReaderImageRetry({
    source: '/imports/demo/chapter-1/001.webp',
    currentAttempt: 3
  });

  assert.equal(retry.canRetry, false);
  assert.equal(retry.attempt, 3);
  assert.equal(retry.src, '/imports/demo/chapter-1/001.webp');
});

test('resolveReaderToolbarVisibility hides on reading scroll and reveals on touch or scroll up', () => {
  assert.equal(resolveReaderToolbarVisibility({
    scrollY: 40,
    lastScrollY: 0,
    currentVisible: false
  }), true);
  assert.equal(resolveReaderToolbarVisibility({
    scrollY: 420,
    lastScrollY: 320,
    currentVisible: true
  }), false);
  assert.equal(resolveReaderToolbarVisibility({
    scrollY: 360,
    lastScrollY: 420,
    currentVisible: false
  }), true);
  assert.equal(resolveReaderToolbarVisibility({
    scrollY: 600,
    lastScrollY: 620,
    currentVisible: false,
    forceShow: true
  }), true);
});
