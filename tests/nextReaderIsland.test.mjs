import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createReaderProgressSnapshot,
  getNextSummaryAfterLastLoaded,
  readerChapterApiPath,
  readerChaptersFromPayload,
  readerCurrentChapterLabel,
  resolveActiveReaderChapterId
} from '../src/components/reader/readerState.mjs';
import {
  applyReaderImageWindow,
  READER_BLANK_IMAGE_SRC
} from '../src/components/reader/readerWindowing.mjs';

test('readerChaptersFromPayload uses the full payload window for continuous reading', () => {
  const chapters = readerChaptersFromPayload({
    chapter: { id: 'chapter-1', pages: [{ imageUrl: '/one.jpg' }] },
    chapters: [
      { id: 'chapter-1', pages: [{ imageUrl: '/one.jpg' }] },
      { id: 'chapter-2', pages: [{ imageUrl: '/two.jpg' }] }
    ]
  });

  assert.deepEqual(chapters.map((chapter) => chapter.id), ['chapter-1', 'chapter-2']);
});

test('getNextSummaryAfterLastLoaded finds the next public chapter after the loaded window', () => {
  const next = getNextSummaryAfterLastLoaded({
    readerChapters: [{ id: 'chapter-1' }, { id: 'chapter-2' }],
    series: {
      chapters: [
        { id: 'chapter-1', imported: true, pageCount: 2 },
        { id: 'chapter-2', imported: true, pageCount: 2 },
        { id: 'chapter-3', imported: true, pageCount: 2 }
      ]
    }
  });

  assert.equal(next?.id, 'chapter-3');
});

test('readerChapterApiPath points the client island at the existing public reader API', () => {
  assert.equal(
    readerChapterApiPath('public-story', 'chapter-3'),
    '/api/reader?series=public-story&chapter=chapter-3&window=0'
  );
});

test('resolveActiveReaderChapterId tracks the chapter crossing the reader viewport', () => {
  const active = resolveActiveReaderChapterId({
    layouts: [
      { id: 'chapter-1', top: 0, bottom: 2200 },
      { id: 'chapter-2', top: 2200, bottom: 4300 }
    ],
    viewportY: 2600,
    fallbackId: 'chapter-1'
  });

  assert.equal(active, 'chapter-2');
});

test('readerCurrentChapterLabel resolves the visible reader chapter title', () => {
  const label = readerCurrentChapterLabel([
    { id: 'chapter-1', title: 'Chương 1' },
    { id: 'chapter-2', label: 'Chương 2' }
  ], 'chapter-2');

  assert.equal(label, 'Chương 2');
  assert.equal(readerCurrentChapterLabel([], 'missing'), '');
});

test('createReaderProgressSnapshot stores chapter-relative scroll without clobbering old shape', () => {
  const snapshot = createReaderProgressSnapshot({
    seriesId: 'public-1',
    chapterId: 'chapter-2',
    pageIndex: 4,
    scrollY: 4200,
    chapterTop: 3600,
    documentScrollableHeight: 8000
  });

  assert.equal(snapshot.chapterScrollY, 600);
  assert.equal(snapshot.progressPercent, 53);
  assert.equal(typeof snapshot.updatedAt, 'string');
});

test('applyReaderImageWindow releases far reader images and restores them near viewport', () => {
  const image = {
    src: '/imports/story/chapter-1/page-8.jpg',
    currentSrc: '/imports/story/chapter-1/page-8.jpg',
    loading: 'lazy',
    complete: true,
    clientWidth: 800,
    width: 800,
    height: 1200,
    dataset: {},
    style: {},
    getAttribute(name) {
      if (name === 'src') return this.src;
      if (name === 'width') return String(this.width);
      if (name === 'height') return String(this.height);
      return '';
    },
    getBoundingClientRect() {
      return { top: 7000, height: 1200 };
    },
    addEventListener() {}
  };

  const released = applyReaderImageWindow({
    images: [image],
    scrollY: 0,
    viewportHeight: 1000
  });

  assert.equal(released.released, 1);
  assert.equal(image.src, READER_BLANK_IMAGE_SRC);
  assert.equal(image.dataset.readerSrc, '/imports/story/chapter-1/page-8.jpg');
  assert.equal(image.dataset.readerReleased, 'true');

  image.getBoundingClientRect = () => ({ top: 850, height: 1200 });

  const restored = applyReaderImageWindow({
    images: [image],
    scrollY: 6200,
    viewportHeight: 1000
  });

  assert.equal(restored.restored, 1);
  assert.equal(image.src, '/imports/story/chapter-1/page-8.jpg');
});

test('ReaderIsland wires reader image windowing into scroll handling', () => {
  const source = fs.readFileSync('src/components/reader/ReaderIsland.tsx', 'utf8');
  assert.match(source, /applyReaderImageWindow/);
  assert.match(source, /data-reader-page-src/);
  assert.match(source, /querySelectorAll<HTMLElement>\('\[data-reader-page-src\]'\)/);
});

test('ReaderIsland renders a client-owned current chapter indicator', () => {
  const source = fs.readFileSync('src/components/reader/ReaderIsland.tsx', 'utf8');
  assert.match(source, /readerCurrentChapterLabel/);
  assert.match(source, /className="next-reader-current"/);
  assert.match(source, /aria-live="polite"/);
});
