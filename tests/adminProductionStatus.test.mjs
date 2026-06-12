import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAdminProductionStatus,
  estimateProductionImageTotal,
  isImportAssetReference,
  productionStatusLabel
} from '../server/adminProductionStatus.mjs';

test('admin production status helpers identify import-backed asset references', () => {
  assert.equal(isImportAssetReference('/imports/series-1/page-1.webp'), true);
  assert.equal(isImportAssetReference('imports/series-1/page-1.webp'), true);
  assert.equal(isImportAssetReference('https://cdn.example.test/imports/series-1/page-1.webp'), true);
  assert.equal(isImportAssetReference('https://external.example.test/page-1.webp'), false);
});

test('estimateProductionImageTotal includes readable pages and one import-backed cover', () => {
  assert.equal(estimateProductionImageTotal({
    pageCount: 12,
    thumbnailUrl: '/imports/series-1/cover.webp',
    coverUrl: '/imports/series-1/other-cover.webp'
  }), 13);
  assert.equal(estimateProductionImageTotal({
    pageCount: 3,
    coverUrl: 'https://external.example.test/cover.webp'
  }), 3);
});

test('buildAdminProductionStatus summarizes public, draft, missing, and syncing series', () => {
  const status = buildAdminProductionStatus(
    {
      series: [
        { id: 'ready', status: 'public', pageCount: 2, thumbnailUrl: '/imports/ready/cover.webp' },
        { id: 'missing', status: 'public', pageCount: 3 },
        { id: 'drafty', status: 'draft', pageCount: 1 },
        { id: 'syncing', status: 'public', pageCount: 10 }
      ]
    },
    {
      updatedAt: '2026-06-12T01:00:00.000Z',
      objects: {
        'imports/ready/cover.webp': true,
        'imports/ready/001.webp': true,
        'imports/ready/002.webp': true,
        'imports/missing/001.webp': true
      }
    },
    {
      status: 'running',
      seriesId: 'syncing',
      checked: 5,
      total: 10,
      percent: 50,
      eta: '2m'
    },
    {
      mode: 'postgres',
      source: 'local',
      productionPostgres: { configured: true }
    }
  );

  assert.equal(status.updatedAt, '2026-06-12T01:00:00.000Z');
  assert.equal(status.storage.productionPostgres.configured, true);
  assert.equal(status.statuses.ready.state, 'ok');
  assert.equal(status.statuses.ready.images.missing, 0);
  assert.equal(status.statuses.missing.state, 'missing-images');
  assert.equal(status.statuses.missing.images.uploaded, 1);
  assert.equal(status.statuses.missing.images.missing, 2);
  assert.equal(status.statuses.drafty.state, 'not-public');
  assert.equal(status.statuses.syncing.state, 'syncing');
  assert.deepEqual(status.statuses.syncing.sync, {
    checked: 5,
    total: 10,
    percent: 50,
    eta: '2m'
  });
});

test('productionStatusLabel keeps admin state labels stable', () => {
  assert.equal(productionStatusLabel('ok'), 'Production OK');
  assert.equal(productionStatusLabel('syncing'), 'Đang sync');
  assert.equal(productionStatusLabel('missing-images'), 'Thiếu ảnh S3');
  assert.equal(productionStatusLabel('not-public'), 'Chưa public');
  assert.equal(productionStatusLabel('unchecked'), 'Chưa kiểm tra');
});
