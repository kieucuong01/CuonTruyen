import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditSeriesSeo,
  buildSeoDescription,
  parseSeoBackfillArgs,
  planSeoMetadataBackfill
} from '../scripts/backfill-seo-metadata.mjs';

const publicSeries = {
  id: 'sample-manhwa',
  slug: 'sample-manhwa',
  title: 'Sample Manhwa',
  status: 'public',
  coverUrl: 'https://truyenqqko.com/cover/sample.jpg',
  tags: [
    { slug: 'manhwa', name: 'Manhwa' },
    { slug: 'action', name: 'Action' },
    { slug: 'fantasy', name: 'Fantasy' }
  ],
  chapters: [
    { id: 'chapter-1', status: 'public' },
    { id: 'chapter-2', status: 'public' },
    { id: 'draft', status: 'draft' }
  ]
};

test('buildSeoDescription creates compact reader-facing Vietnamese metadata', () => {
  const description = buildSeoDescription(publicSeries, { maxLength: 190 });

  assert.match(description, /Đọc Sample Manhwa online tại Cuộn Truyện/);
  assert.match(description, /2 chương truyện Hàn/);
  assert.match(description, /Action, Fantasy/);
  assert.match(description, /tự lưu tiến độ/);
  assert.ok(description.length <= 190);
});

test('planSeoMetadataBackfill only updates missing public descriptions by default', () => {
  const catalog = {
    series: [
      publicSeries,
      {
        ...publicSeries,
        id: 'already-described',
        slug: 'already-described',
        description: 'Mô tả đã biên tập.'
      },
      {
        ...publicSeries,
        id: 'draft-series',
        slug: 'draft-series',
        status: 'draft'
      }
    ]
  };

  const plan = planSeoMetadataBackfill(catalog);

  assert.equal(plan.audit.total, 3);
  assert.equal(plan.audit.scoped, 2);
  assert.equal(plan.audit.missingDescriptions, 1);
  assert.deepEqual(plan.updates.map((update) => update.id), ['sample-manhwa']);
});

test('planSeoMetadataBackfill can target ids and overwrite descriptions explicitly', () => {
  const catalog = {
    series: [{
      ...publicSeries,
      id: 'already-described',
      slug: 'already-described',
      description: 'Mô tả đã biên tập.'
    }]
  };

  const args = parseSeoBackfillArgs([
    '--series-id=already-described',
    '--overwrite-description',
    '--limit=1'
  ]);
  const plan = planSeoMetadataBackfill(catalog, args);

  assert.equal(plan.updates.length, 1);
  assert.equal(plan.updates[0].previousDescription, 'Mô tả đã biên tập.');
});

test('auditSeriesSeo reports external truyenqq covers and missing thumbnails', () => {
  const audit = auditSeriesSeo(publicSeries);

  assert.equal(audit.missingDescription, true);
  assert.equal(audit.externalCover, true);
  assert.equal(audit.truyenqqCover, true);
  assert.equal(audit.missingThumbnail, true);
});
