import test from 'node:test';
import assert from 'node:assert/strict';

import { createProgressSnapshot, progressStorageKey } from '../public/readingProgress.mjs';

test('progressStorageKey is stable per series', () => {
  assert.equal(progressStorageKey('demo-series'), 'comic-reader-progress:demo-series');
});

test('createProgressSnapshot keeps the resume fields the reader needs', () => {
  const snapshot = createProgressSnapshot({
    seriesId: 'demo-series',
    chapterId: 'chapter-12',
    pageIndex: 4,
    scrollY: 3812,
    progressPercent: 63
  });

  assert.equal(snapshot.seriesId, 'demo-series');
  assert.equal(snapshot.chapterId, 'chapter-12');
  assert.equal(snapshot.pageIndex, 4);
  assert.equal(snapshot.scrollY, 3812);
  assert.equal(snapshot.progressPercent, 63);
  assert.equal(typeof snapshot.updatedAt, 'string');
});
