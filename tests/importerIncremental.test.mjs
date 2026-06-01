import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveImportedChapterStatus,
  selectNewChaptersForImport
} from '../server/importer.mjs';

test('selectNewChaptersForImport skips existing chapters by normalized source URL', () => {
  const parsed = [
    { id: 'chapter-1', label: 'Chapter 1', url: 'https://example.test/series/chapter-1/' },
    { id: 'chapter-2', label: 'Chapter 2', url: 'https://example.test/series/chapter-2' }
  ];
  const existing = [
    { id: 'old-id', label: 'Old label', sourceUrl: 'https://example.test/series/chapter-1#comments' }
  ];

  const result = selectNewChaptersForImport(parsed, existing);

  assert.deepEqual(result.chapters.map((chapter) => chapter.id), ['chapter-2']);
  assert.equal(result.skippedExistingChapterCount, 1);
});

test('selectNewChaptersForImport falls back to id, slug, and label matching', () => {
  const parsed = [
    { id: 'chapter-1', label: 'Chapter 1', url: 'https://example.test/a' },
    { id: 'chapter-2', slug: 'chapter-2', label: 'Chapter 2', url: 'https://example.test/b' },
    { id: 'chapter-3', label: 'Chapter 3', url: 'https://example.test/c' }
  ];
  const existing = [
    { id: 'chapter-1' },
    { slug: 'chapter-2' }
  ];

  const result = selectNewChaptersForImport(parsed, existing);

  assert.deepEqual(result.chapters.map((chapter) => chapter.id), ['chapter-3']);
  assert.equal(result.skippedExistingChapterCount, 2);
});

test('resolveImportedChapterStatus publishes new chapters only for public series', () => {
  assert.equal(resolveImportedChapterStatus({
    mode: 'new-chapters',
    publishNewChapters: true,
    existingSeries: { status: 'public' }
  }), 'public');
  assert.equal(resolveImportedChapterStatus({
    mode: 'new-chapters',
    publishNewChapters: true,
    existingSeries: { status: 'draft' }
  }), 'draft');
  assert.equal(resolveImportedChapterStatus({
    mode: 'full',
    publishNewChapters: true,
    existingSeries: { status: 'public' }
  }), 'draft');
});
