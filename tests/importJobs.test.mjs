import test from 'node:test';
import assert from 'node:assert/strict';

import { createImportJob, getImportJob } from '../server/importJobs.mjs';

test('createImportJob exposes running progress and final completion', async () => {
  const job = createImportJob(
    { url: 'https://example.test/comic', maxChapters: 2, maxPages: 3 },
    async (_payload, onProgress) => {
      onProgress({
        phase: 'downloading-images',
        message: 'Downloading chapter 1',
        totalChapters: 2,
        processedChapters: 1,
        totalImages: 3,
        downloadedImages: 2,
        currentChapterLabel: 'Chapter 1'
      });
      return { id: 'series-1', title: 'Series One', chapters: [] };
    }
  );

  assert.equal(job.status, 'running');
  assert.equal(job.progress.phase, 'queued');

  await job.done;

  const finished = getImportJob(job.id);
  assert.equal(finished.status, 'completed');
  assert.equal(finished.series.id, 'series-1');
  assert.equal(finished.progress.processedChapters, 2);
  assert.equal(finished.progress.downloadedImages, 2);
});

test('createImportJob records failed imports with a useful message', async () => {
  const job = createImportJob(
    { url: 'https://example.test/comic' },
    async () => {
      throw new Error('Source blocked crawler');
    }
  );

  await assert.rejects(job.done, /Source blocked crawler/);

  const failed = getImportJob(job.id);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, 'Source blocked crawler');
  assert.equal(failed.progress.phase, 'failed');
});
