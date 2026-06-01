import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeSeries } from '../server/catalogStore.mjs';

test('mergeSeries keeps previously imported chapters when a later crawl imports fewer chapters', () => {
  const existing = {
    id: 'series-1',
    title: 'Series',
    importedAt: '2026-01-01T00:00:00.000Z',
    chapters: [
      {
        id: 'chapter-1',
        label: 'Chapter 1',
        imported: true,
        pageCount: 14,
        pages: [{ index: 0, src: '/imports/series-1/chapter-1/001.jpg' }]
      },
      {
        id: 'chapter-2',
        label: 'Chapter 2',
        imported: true,
        pageCount: 12,
        pages: [{ index: 0, src: '/imports/series-1/chapter-2/001.jpg' }]
      }
    ]
  };
  const incoming = {
    id: 'series-1',
    title: 'Series',
    chapters: [
      {
        id: 'chapter-1',
        label: 'Chapter 1',
        imported: true,
        pageCount: 14,
        pages: [{ index: 0, src: '/imports/series-1/chapter-1/001.jpg' }]
      }
    ]
  };

  const merged = mergeSeries(existing, incoming);

  assert.equal(merged.importedAt, existing.importedAt);
  assert.deepEqual(merged.chapters.map((chapter) => chapter.id), ['chapter-1', 'chapter-2']);
  assert.equal(merged.chapters[1].imported, true);
  assert.equal(merged.chapters[1].pageCount, 12);
});

test('mergeSeries replaces a previously empty chapter with newly imported pages', () => {
  const existing = {
    id: 'series-1',
    chapters: [
      {
        id: 'chapter-1',
        label: 'Chapter 1',
        imported: false,
        pageCount: 0,
        pages: []
      }
    ]
  };
  const incoming = {
    id: 'series-1',
    chapters: [
      {
        id: 'chapter-1',
        label: 'Chapter 1',
        imported: true,
        pageCount: 3,
        pages: [{ index: 0, src: '/imports/series-1/chapter-1/001.jpg' }]
      }
    ]
  };

  const merged = mergeSeries(existing, incoming);

  assert.equal(merged.chapters[0].imported, true);
  assert.equal(merged.chapters[0].pageCount, 3);
});

test('mergeSeries keeps existing public moderation when recrawl defaults to draft', () => {
  const existing = {
    id: 'series-1',
    title: 'Series',
    status: 'public',
    chapters: [
      {
        id: 'chapter-1',
        label: 'Chapter 1',
        status: 'public',
        imported: true,
        pageCount: 1,
        pages: [{ index: 0, src: '/imports/series-1/chapter-1/001.jpg' }]
      },
      {
        id: 'chapter-2',
        label: 'Chapter 2',
        status: 'removed',
        imported: true,
        pageCount: 1,
        pages: [{ index: 0, src: '/imports/series-1/chapter-2/001.jpg' }]
      }
    ]
  };
  const incoming = {
    id: 'series-1',
    title: 'Series',
    status: 'draft',
    chapters: [
      {
        id: 'chapter-1',
        label: 'Chapter 1',
        status: 'draft',
        imported: true,
        pageCount: 1,
        pages: [{ index: 0, src: '/imports/series-1/chapter-1/001-new.jpg' }]
      },
      {
        id: 'chapter-2',
        label: 'Chapter 2',
        status: 'draft',
        imported: true,
        pageCount: 1,
        pages: [{ index: 0, src: '/imports/series-1/chapter-2/001-new.jpg' }]
      }
    ]
  };

  const merged = mergeSeries(existing, incoming);

  assert.equal(merged.status, 'public');
  assert.equal(merged.chapters[0].status, 'public');
  assert.equal(merged.chapters[1].status, 'removed');
});

test('mergeSeries appends newly imported public chapters without dropping existing pages', () => {
  const existing = {
    id: 'series-1',
    title: 'Series',
    status: 'public',
    chapters: [
      {
        id: 'chapter-1',
        label: 'Chapter 1',
        status: 'public',
        sourceOrder: 1,
        imported: true,
        pageCount: 1,
        pages: [{ index: 0, src: '/imports/series-1/chapter-1/001.jpg' }]
      }
    ]
  };
  const incoming = {
    id: 'series-1',
    title: 'Series',
    status: 'public',
    chapters: [
      {
        id: 'chapter-2',
        label: 'Chapter 2',
        status: 'public',
        sourceOrder: 2,
        imported: true,
        pageCount: 1,
        pages: [{ index: 0, src: '/imports/series-1/chapter-2/001.jpg' }]
      }
    ]
  };

  const merged = mergeSeries(existing, incoming);

  assert.deepEqual(merged.chapters.map((chapter) => chapter.id), ['chapter-1', 'chapter-2']);
  assert.equal(merged.chapters[0].pages[0].src, '/imports/series-1/chapter-1/001.jpg');
  assert.equal(merged.chapters[1].status, 'public');
});
