import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findExistingSeriesForImport,
  selectNewChaptersForImport,
  selectRefreshImageUrlChapters,
  sourceIdentityKey,
  sourceMappingsWith
} from '../server/importChapterSelection.mjs';

test('import chapter selection module owns source mirror identity helpers', () => {
  const canonical = 'https://truyenqqko.com/truyen-tranh/gacha-vo-han-13496';
  const mirror = 'https://truyenqqgo.com/truyen-tranh/gacha-vo-han-13496/';
  const existing = {
    id: 'gacha-existing',
    slug: 'gacha-vo-han',
    sourceUrl: canonical,
    sourceMappings: [{ adapter: 'truyenqq', sourceUrl: canonical }]
  };

  assert.equal(sourceIdentityKey(canonical), sourceIdentityKey(mirror));
  assert.equal(
    findExistingSeriesForImport({ series: [existing] }, { slug: 'other-slug' }, mirror),
    existing
  );
  assert.deepEqual(sourceMappingsWith(existing, 'truyenqq', mirror), [
    { adapter: 'truyenqq', sourceUrl: canonical },
    { adapter: 'truyenqq', sourceUrl: mirror }
  ]);
});

test('import chapter selection module owns new and refresh chapter matching', () => {
  const parsed = [
    { id: 'source-c1', slug: 'source-1', label: 'Source 1', url: 'https://example.test/series/chapter-1' },
    { id: 'source-c2', slug: 'source-2', label: 'Source 2', url: 'https://example.test/series/chapter-2' }
  ];
  const existing = [
    { id: 'local-c1', slug: 'chuong-1', label: 'Chuong 1', sourceUrl: 'https://example.test/series/chapter-1#comments' }
  ];

  const newOnly = selectNewChaptersForImport(parsed, existing);
  assert.deepEqual(newOnly.chapters.map((chapter) => chapter.id), ['source-c2']);
  assert.equal(newOnly.skippedExistingChapterCount, 1);

  const refresh = selectRefreshImageUrlChapters(parsed, existing);
  assert.equal(refresh.refreshedExistingChapterCount, 1);
  assert.equal(refresh.newChapterCount, 1);
  assert.deepEqual(refresh.chapters.map((chapter) => chapter.id), ['local-c1', 'source-c2']);
  assert.equal(refresh.chapters[0].slug, 'chuong-1');
});
