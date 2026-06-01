import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  claimNextImportJob,
  completeImportJob,
  createImportJob,
  failImportJob,
  getImportJob,
  getRunningImportJobForUrl,
  updateImportJobProgress
} from '../server/importJobs.mjs';

const queuePath = path.join(os.tmpdir(), `comic-reader-crawl-jobs-${process.pid}.json`);
process.env.CRAWL_QUEUE_PATH = queuePath;

test.beforeEach(async () => {
  await fs.rm(queuePath, { force: true });
});

test('createImportJob persists queued progress and dedupes active source URLs', async () => {
  const first = await createImportJob({
    url: 'https://example.test/comic#comments',
    maxChapters: 2,
    maxPages: 3
  });
  const second = await createImportJob({
    url: 'https://example.test/comic/',
    maxChapters: 2,
    maxPages: 3
  });

  assert.equal(first.reused, false);
  assert.equal(first.job.status, 'queued');
  assert.equal(second.reused, true);
  assert.equal(second.job.id, first.job.id);
  assert.equal((await getRunningImportJobForUrl('https://example.test/comic')).id, first.job.id);
});

test('claim, progress, complete lifecycle is durable through getImportJob', async () => {
  const created = await createImportJob({ url: 'https://example.test/comic' });
  const claimed = await claimNextImportJob({ workerId: 'test-worker', now: created.job.runAfter });

  assert.equal(claimed.id, created.job.id);
  assert.equal(claimed.status, 'running');
  assert.equal(claimed.attempts, 1);

  await updateImportJobProgress(claimed.id, {
    phase: 'downloading-images',
    totalChapters: 2,
    processedChapters: 1,
    totalImages: 10,
    downloadedImages: 4
  }, {
    now: '2026-05-24T10:01:00.000Z'
  });

  const completed = await completeImportJob(claimed.id, {
    id: 'series-1',
    title: 'Series One',
    chapters: []
  }, {
    now: '2026-05-24T10:02:00.000Z'
  });

  assert.equal(completed.status, 'completed');
  assert.equal(completed.series.id, 'series-1');
  assert.equal((await getImportJob(claimed.id)).progress.downloadedImages, 4);
});

test('failImportJob retries until max attempts, then marks failed', async () => {
  const created = await createImportJob({
    url: 'https://example.test/comic',
    maxAttempts: 1
  });
  const claimed = await claimNextImportJob({ workerId: 'test-worker' });
  const failed = await failImportJob(claimed.id, new Error('Source blocked crawler'));

  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'Source blocked crawler');
  assert.equal((await getRunningImportJobForUrl(created.job.payload.url)), null);
});
