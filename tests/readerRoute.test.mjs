import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveContinueChapterProgress } from '../public/routes/reader.mjs';

const readableChapters = [
  { id: 'chapter-1', slug: 'chuong-1', label: 'Chương 1', imported: true, pageCount: 8 },
  { id: 'chapter-2', slug: 'chuong-2', label: 'Chương 2', imported: true, pageCount: 9 },
  { id: 'chapter-3', slug: 'chuong-3', label: 'Chương 3', imported: true, pageCount: 10 },
  { id: 'chapter-4', slug: 'chuong-4', label: 'Chương 4', imported: true, pageCount: 11 }
];

test('resolveContinueChapterProgress reports the current chapter as 1-based progress', () => {
  const progress = resolveContinueChapterProgress({
    chapters: readableChapters
  }, {
    chapterId: 'chapter-3'
  });

  assert.equal(progress.chapter.id, 'chapter-3');
  assert.equal(progress.chapterNumber, 3);
  assert.equal(progress.completed, 3);
  assert.equal(progress.total, 4);
  assert.equal(progress.percent, 75);
});

test('resolveContinueChapterProgress matches saved chapter slugs', () => {
  const progress = resolveContinueChapterProgress({
    chapters: readableChapters
  }, {
    chapterId: 'chuong-2'
  });

  assert.equal(progress.chapter.id, 'chapter-2');
  assert.equal(progress.chapterNumber, 2);
  assert.equal(progress.completed, 2);
  assert.equal(progress.total, 4);
  assert.equal(progress.percent, 50);
});

test('resolveContinueChapterProgress falls back to the first readable chapter', () => {
  const progress = resolveContinueChapterProgress({
    chapters: [
      { id: 'draft-chapter', slug: 'draft', label: 'Draft' },
      ...readableChapters
    ]
  }, {
    chapterId: 'missing'
  });

  assert.equal(progress.chapter.id, 'chapter-1');
  assert.equal(progress.chapterNumber, 1);
  assert.equal(progress.completed, 1);
  assert.equal(progress.total, 4);
  assert.equal(progress.percent, 25);
});
