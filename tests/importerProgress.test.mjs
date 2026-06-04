import test from 'node:test';
import assert from 'node:assert/strict';

import { progressMetrics } from '../server/importer.mjs';

test('progressMetrics separates downloaded, skipped, usable, and failed images', () => {
  const metrics = progressMetrics({
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    totalImages: 20,
    downloadedImages: 5,
    skippedExistingImages: 7,
    failedImages: 2,
    processedChapters: 3,
    totalChapters: 10
  });

  assert.equal(metrics.downloadedImages, 5);
  assert.equal(metrics.skippedExistingImages, 7);
  assert.equal(metrics.usableImages, 12);
  assert.equal(metrics.failedImages, 2);
  assert.equal(metrics.processedImages, 14);
  assert.equal(metrics.totalChapters, 10);
  assert.ok(metrics.imagesPerMinute > 0);
  assert.ok(metrics.chaptersPerMinute > 0);
  assert.ok(metrics.etaSeconds >= 0);
});
