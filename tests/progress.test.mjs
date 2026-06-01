import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createProgressSnapshot,
  loadLastSeriesId,
  loadProgress,
  loadReadingHistory,
  progressStorageKey,
  saveProgress
} from '../public/readingProgress.mjs';

test('progressStorageKey is stable per series', () => {
  assert.equal(progressStorageKey('demo-series'), 'comic-reader-progress:demo-series');
});

test('createProgressSnapshot keeps the resume fields the reader needs', () => {
  const snapshot = createProgressSnapshot({
    seriesId: 'demo-series',
    chapterId: 'chapter-12',
    pageIndex: 4,
    scrollY: 3812,
    chapterScrollY: 640,
    progressPercent: 63
  });

  assert.equal(snapshot.seriesId, 'demo-series');
  assert.equal(snapshot.chapterId, 'chapter-12');
  assert.equal(snapshot.pageIndex, 4);
  assert.equal(snapshot.scrollY, 3812);
  assert.equal(snapshot.chapterScrollY, 640);
  assert.equal(snapshot.progressPercent, 63);
  assert.equal(typeof snapshot.updatedAt, 'string');
});

test('saveProgress falls back when localStorage is unavailable', () => {
  const snapshot = createProgressSnapshot({
    seriesId: 'memory-series',
    chapterId: 'chapter-3',
    pageIndex: 7,
    scrollY: 12000,
    progressPercent: 44
  });

  saveProgress(snapshot);

  assert.deepEqual(loadProgress('memory-series'), snapshot);
  assert.equal(loadLastSeriesId(), 'memory-series');
  assert.equal(loadReadingHistory()[0], 'memory-series');
});

test('createResumeLoadPlan renders the saved chapter before restoring scroll', async () => {
  const { createResumeLoadPlan } = await import('../public/readingProgress.mjs');
  const chapters = [
    { id: 'chapter-1' },
    { id: 'chapter-2' },
    { id: 'chapter-3' },
    { id: 'chapter-4' }
  ];

  const plan = createResumeLoadPlan(chapters, { chapterId: 'chapter-4' });

  assert.equal(plan.currentChapterId, 'chapter-4');
  assert.equal(plan.loadedChapterCount, 4);
});

test('canSaveReaderProgress blocks the initial save while restoring old scroll', async () => {
  const { canSaveReaderProgress } = await import('../public/readingProgress.mjs');

  assert.equal(canSaveReaderProgress({ isRestoring: true, hasSeries: true, hasChapter: true, hasReader: true }), false);
  assert.equal(canSaveReaderProgress({ isRestoring: false, hasSeries: true, hasChapter: true, hasReader: false }), false);
  assert.equal(canSaveReaderProgress({ isRestoring: false, hasSeries: true, hasChapter: true, hasReader: true }), true);
});

test('updateReadingHistory keeps recently read series first without duplicates', async () => {
  const { updateReadingHistory } = await import('../public/readingProgress.mjs');

  const first = updateReadingHistory([], 'series-1');
  const second = updateReadingHistory(first, 'series-2');
  const third = updateReadingHistory(second, 'series-1');

  assert.deepEqual(third, ['series-1', 'series-2']);
});

test('findCurrentChapterFromLayout tracks the chapter crossing the reader viewport', async () => {
  const { findCurrentChapterFromLayout } = await import('../public/readingProgress.mjs');
  const chapters = [
    { id: 'chapter-1', top: 0, bottom: 1800 },
    { id: 'chapter-2', top: 1800, bottom: 3600 },
    { id: 'chapter-3', top: 3600, bottom: 5400 }
  ];

  assert.equal(findCurrentChapterFromLayout(chapters, 300, 'chapter-1'), 'chapter-1');
  assert.equal(findCurrentChapterFromLayout(chapters, 1900, 'chapter-1'), 'chapter-2');
  assert.equal(findCurrentChapterFromLayout(chapters, 3700, 'chapter-2'), 'chapter-3');
});
