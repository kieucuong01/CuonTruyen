import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applySeriesFilters,
  buildTagOptions,
  normalizeFilterText
} from '../public/seriesFilters.mjs';

const fixtures = [
  {
    id: 'strongest',
    title: 'Mạnh Nhất Lịch Sử',
    slug: 'manh-nhat-lich-su',
    aliases: ['Strongest Ever'],
    tags: [{ slug: 'hanh-dong', name: 'Hành động' }],
    chapters: [
      { id: 'c1', imported: true, pageCount: 12 },
      { id: 'c2', imported: true, pageCount: 10 }
    ],
    importedChapterCount: 2,
    pageCount: 22,
    updatedAt: '2026-05-22T10:00:00.000Z',
    stats: { views: 100 }
  },
  {
    id: 'draft',
    title: 'Hoa Sơn Tái Khởi',
    slug: 'hoa-son-tai-khoi',
    aliases: [],
    tags: [{ slug: 'kiem-hiep', name: 'Kiếm hiệp' }],
    chapters: [
      { id: 'c1', imported: false, pageCount: 0 }
    ],
    importedChapterCount: 0,
    pageCount: 0,
    updatedAt: '2026-05-23T10:00:00.000Z',
    stats: { views: 500 }
  },
  {
    id: 'academy',
    title: 'Thiên tài học viện ma pháp',
    slug: 'thien-tai-hoc-vien',
    aliases: ['Magic Academy'],
    tags: [{ slug: 'hoc-duong', name: 'Học đường' }],
    chapters: [
      { id: 'c1', pages: [{ imageUrl: '/1.jpg' }] },
      { id: 'c2', imported: true, pageCount: 8 },
      { id: 'c3', imported: true, pageCount: 8 }
    ],
    importedChapterCount: 3,
    pageCount: 17,
    updatedAt: '2026-05-21T10:00:00.000Z',
    stats: { views: 50 }
  }
];

test('normalizeFilterText makes Vietnamese search accent-insensitive', () => {
  assert.equal(normalizeFilterText('Mạnh Nhất Lịch Sử'), 'manh nhat lich su');
});

test('applySeriesFilters searches title, slug, alias and tag text', () => {
  assert.deepEqual(
    applySeriesFilters(fixtures, { query: 'manh nhat' }).map((series) => series.id),
    ['strongest']
  );
  assert.deepEqual(
    applySeriesFilters(fixtures, { query: 'magic' }).map((series) => series.id),
    ['academy']
  );
});

test('applySeriesFilters filters by tag and readable status', () => {
  assert.deepEqual(
    applySeriesFilters(fixtures, { tag: 'hanh-dong', status: 'readable' }).map((series) => series.id),
    ['strongest']
  );
  assert.deepEqual(
    applySeriesFilters(fixtures, { status: 'unreadable' }).map((series) => series.id),
    ['draft']
  );
});

test('applySeriesFilters sorts by update time, popularity, title and chapter count', () => {
  assert.deepEqual(applySeriesFilters(fixtures, { sort: 'updated' }).map((series) => series.id), ['draft', 'strongest', 'academy']);
  assert.deepEqual(applySeriesFilters(fixtures, { sort: 'popular' }).map((series) => series.id), ['draft', 'strongest', 'academy']);
  assert.deepEqual(applySeriesFilters(fixtures, { sort: 'title' }).map((series) => series.id), ['draft', 'strongest', 'academy']);
  assert.deepEqual(applySeriesFilters(fixtures, { sort: 'chapters' }).map((series) => series.id), ['academy', 'strongest', 'draft']);
});

test('buildTagOptions returns canonical tag options with counts', () => {
  assert.deepEqual(buildTagOptions(fixtures), [
    { slug: 'hanh-dong', name: 'Hành động', count: 1 },
    { slug: 'hoc-duong', name: 'Học đường', count: 1 },
    { slug: 'kiem-hiep', name: 'Kiếm hiệp', count: 1 }
  ]);
});
