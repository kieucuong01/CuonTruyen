import test from 'node:test';
import assert from 'node:assert/strict';

import { createRefreshImageUrlsPayload } from '../server/crawlQueue.mjs';
import {
  selectRefreshImageUrlChapters,
  resolveImportedChapterStatus,
  selectNewChaptersForImport
} from '../server/importer.mjs';
import { mergeSeries } from '../server/catalogMerge.mjs';

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

test('resolveImportedChapterStatus publishes imported chapters by default', () => {
  assert.equal(resolveImportedChapterStatus({
    mode: 'new-chapters',
    publishNewChapters: true,
    existingSeries: { status: 'public' }
  }), 'public');
  assert.equal(resolveImportedChapterStatus({
    mode: 'new-chapters',
    publishNewChapters: true,
    existingSeries: { status: 'draft' }
  }), 'public');
  assert.equal(resolveImportedChapterStatus({
    mode: 'full',
    publishNewChapters: true,
    existingSeries: { status: 'public' }
  }), 'public');
});

test('selectRefreshImageUrlChapters reuses existing chapter identity and reports new chapters', () => {
  const parsed = [
    { id: 'source-chapter-1', slug: 'source-1', label: 'Source 1', url: 'https://example.test/series/chapter-1' },
    { id: 'source-chapter-2', slug: 'source-2', label: 'Source 2', url: 'https://example.test/series/chapter-2' }
  ];
  const existing = [
    { id: 'local-c1', slug: 'chuong-1', label: 'Chuong 1', sourceUrl: 'https://example.test/series/chapter-1#comments' }
  ];

  const result = selectRefreshImageUrlChapters(parsed, existing);

  assert.equal(result.refreshedExistingChapterCount, 1);
  assert.equal(result.newChapterCount, 1);
  assert.deepEqual(result.chapters.map((chapter) => chapter.id), ['local-c1', 'source-chapter-2']);
  assert.equal(result.chapters[0].slug, 'chuong-1');
  assert.equal(result.chapters[0].url, 'https://example.test/series/chapter-1');
});

test('refreshed image URL chapters merge without dropping untouched chapters or moderation', () => {
  const existing = {
    id: 'series-1',
    title: 'Series',
    status: 'public',
    chapters: [
      {
        id: 'local-c1',
        status: 'removed',
        imported: true,
        pageCount: 1,
        sourceOrder: 1,
        pages: [{ imageUrl: 'https://old-cdn.test/001.jpg', assetStatus: 'external' }]
      },
      {
        id: 'local-c2',
        status: 'public',
        imported: true,
        pageCount: 1,
        sourceOrder: 2,
        pages: [{ imageUrl: 'https://old-cdn.test/002.jpg', assetStatus: 'external' }]
      }
    ]
  };
  const incoming = {
    id: 'series-1',
    title: 'Series',
    status: 'public',
    chapters: [
      {
        id: 'local-c1',
        status: 'public',
        imported: true,
        pageCount: 2,
        sourceOrder: 1,
        pages: [
          { imageUrl: 'https://new-cdn.test/001.jpg', assetStatus: 'external' },
          { imageUrl: 'https://new-cdn.test/002.jpg', assetStatus: 'external' }
        ]
      }
    ]
  };

  const merged = mergeSeries(existing, incoming);

  assert.equal(merged.chapters.length, 2);
  assert.equal(merged.chapters[0].id, 'local-c1');
  assert.equal(merged.chapters[0].status, 'removed');
  assert.equal(merged.chapters[0].pageCount, 2);
  assert.equal(merged.chapters[0].pages[0].imageUrl, 'https://new-cdn.test/001.jpg');
  assert.equal(merged.chapters[1].id, 'local-c2');
  assert.equal(merged.chapters[1].pages[0].imageUrl, 'https://old-cdn.test/002.jpg');
});

test('createRefreshImageUrlsPayload queues URL-only refresh for the whole series', () => {
  const payload = createRefreshImageUrlsPayload({
    id: 'series-1',
    importMode: 'full_download',
    sourceUrl: 'https://example.test/series'
  });

  assert.equal(payload.url, 'https://example.test/series');
  assert.equal(payload.seriesId, 'series-1');
  assert.equal(payload.mode, 'refresh-image-urls');
  assert.equal(payload.assetMode, 'image_url');
  assert.equal(payload.maxChapters, 0);
  assert.equal(payload.maxPages, 0);
  assert.equal(payload.reason, 'manual-refresh-image-urls');
});
