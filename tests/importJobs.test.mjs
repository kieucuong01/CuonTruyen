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
  resetStaleRunningImportJobs,
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

test('resetStaleRunningImportJobs moves old running jobs back to retrying', async () => {
  const created = await createImportJob({ url: 'https://example.test/stale-comic' });
  const claimedAt = new Date(Date.parse(created.job.runAfter)).toISOString();
  const staleAt = new Date(Date.parse(claimedAt) + 30 * 60 * 1000).toISOString();
  const reclaimedAt = new Date(Date.parse(staleAt) + 60_000).toISOString();
  const claimed = await claimNextImportJob({
    workerId: 'stale-worker',
    now: claimedAt
  });

  assert.equal(claimed.id, created.job.id);
  assert.equal(claimed.status, 'running');

  const resetCount = await resetStaleRunningImportJobs({
    now: staleAt,
    staleMs: 5 * 60 * 1000
  });
  const resetJob = await getImportJob(claimed.id);

  assert.equal(resetCount, 1);
  assert.equal(resetJob.status, 'retrying');

  const reclaimed = await claimNextImportJob({
    workerId: 'fresh-worker',
    now: reclaimedAt
  });
  assert.equal(reclaimed.id, claimed.id);
  assert.equal(reclaimed.status, 'running');
});

test('resetStaleRunningImportJobs resets a running job locked by a dead worker pid', async () => {
  const created = await createImportJob({ url: 'https://example.test/dead-worker-comic' });
  const claimedAt = new Date(Date.parse(created.job.runAfter)).toISOString();
  const checkedAt = new Date(Date.parse(claimedAt) + 1_000).toISOString();
  const claimed = await claimNextImportJob({
    workerId: 'crawl-worker-99999999',
    now: claimedAt
  });

  assert.equal(claimed.status, 'running');

  const resetCount = await resetStaleRunningImportJobs({
    now: checkedAt,
    staleMs: 60 * 60 * 1000
  });

  assert.equal(resetCount, 1);
  assert.equal((await getImportJob(claimed.id)).status, 'retrying');
});
