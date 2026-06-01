import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVE_JOB_STATUSES,
  buildInitialProgress,
  createScheduledCrawlPayloads,
  createQueuedImportJob,
  createUpdateChaptersPayload,
  normalizeSourceUrl,
  selectScheduledSeries,
  shouldReuseActiveJob
} from '../server/crawlQueue.mjs';

test('queued import jobs keep batch progress at series, chapter, and image level', () => {
  const job = createQueuedImportJob({
    url: 'https://truyenqqko.com/truyen-tranh/manh-nhat-lich-su-5968',
    maxChapters: 3,
    maxPages: 0,
    batchId: 'batch-1',
    seriesIndex: 2,
    totalSeries: 4
  }, {
    now: '2026-05-24T10:00:00.000Z',
    id: 'import-test'
  });

  assert.equal(job.id, 'import-test');
  assert.equal(job.status, 'queued');
  assert.equal(job.payload.batchId, 'batch-1');
  assert.equal(job.progress.totalSeries, 4);
  assert.equal(job.progress.processedSeries, 1);
  assert.equal(job.progress.seriesIndex, 2);
  assert.equal(job.progress.totalChapters, 0);
  assert.equal(job.progress.totalImages, 0);
  assert.equal(job.runAfter, '2026-05-24T10:00:00.000Z');
});

test('active queued, running, and retrying jobs are reused for the same normalized source URL', () => {
  const active = createQueuedImportJob({
    url: 'https://truyenqqko.com/truyen-tranh/manh-nhat-lich-su-5968#comments'
  }, {
    now: '2026-05-24T10:00:00.000Z',
    id: 'import-active'
  });

  assert.equal(normalizeSourceUrl(active.sourceUrl), 'https://truyenqqko.com/truyen-tranh/manh-nhat-lich-su-5968');
  assert.equal(shouldReuseActiveJob(active, 'https://truyenqqko.com/truyen-tranh/manh-nhat-lich-su-5968/'), true);
  assert.equal(ACTIVE_JOB_STATUSES.has('queued'), true);
  assert.equal(ACTIVE_JOB_STATUSES.has('running'), true);
  assert.equal(ACTIVE_JOB_STATUSES.has('retrying'), true);
  assert.equal(ACTIVE_JOB_STATUSES.has('completed'), false);
});

test('buildInitialProgress can surface crawl errors without losing counters', () => {
  const progress = buildInitialProgress({
    totalSeries: 2,
    seriesIndex: 1,
    url: 'https://example.test/a'
  }, '2026-05-24T10:00:00.000Z');

  assert.deepEqual(progress.errors, []);
  assert.equal(progress.totalSeries, 2);
  assert.equal(progress.processedSeries, 0);
  assert.equal(progress.currentSeriesUrl, 'https://example.test/a');
});

test('selectScheduledSeries picks due enabled schedules and optional hot series only after interval', () => {
  const now = Date.parse('2026-05-24T12:00:00.000Z');
  const catalog = {
    series: [
      {
        id: 'due-series',
        title: 'Due Series',
        sourceUrl: 'https://example.test/due',
        crawlSchedule: {
          enabled: true,
          intervalHours: 6,
          lastQueuedAt: '2026-05-24T04:00:00.000Z'
        },
        stats: { views: 10 }
      },
      {
        id: 'recent-series',
        title: 'Recent Series',
        sourceUrl: 'https://example.test/recent',
        crawlSchedule: {
          enabled: true,
          intervalHours: 24,
          lastQueuedAt: '2026-05-24T11:00:00.000Z'
        },
        stats: { views: 1000 }
      },
      {
        id: 'hot-series',
        title: 'Hot Series',
        sourceMappings: [{ sourceUrl: 'https://example.test/hot' }],
        crawlSchedule: {
          enabled: false,
          intervalHours: 12,
          lastQueuedAt: '2026-05-23T20:00:00.000Z'
        },
        stats: { views: 5000, follows: 20 }
      }
    ]
  };

  const selected = selectScheduledSeries(catalog, {
    now,
    hotAuto: true,
    hotMinScore: 1000,
    hotLimit: 5
  });

  assert.deepEqual(selected.map((item) => item.series.id), ['hot-series', 'due-series']);
  assert.equal(selected[0].reason, 'hot');
  assert.equal(selected[1].reason, 'schedule');
});

test('createUpdateChaptersPayload builds an incremental admin update job payload', () => {
  const payload = createUpdateChaptersPayload({
    id: 'series-1',
    sourceMappings: [{ sourceUrl: 'https://example.test/series' }]
  });

  assert.equal(payload.url, 'https://example.test/series');
  assert.equal(payload.seriesId, 'series-1');
  assert.equal(payload.mode, 'new-chapters');
  assert.equal(payload.publishNewChapters, true);
  assert.equal(payload.maxPages, 0);
});

test('scheduled crawl payloads use incremental new chapter mode', () => {
  const payloads = createScheduledCrawlPayloads([
    {
      reason: 'schedule',
      series: {
        id: 'series-1',
        sourceUrl: 'https://example.test/series',
        crawlSchedule: { maxChapters: 5, maxPages: 0 }
      }
    }
  ]);

  assert.equal(payloads[0].mode, 'new-chapters');
  assert.equal(payloads[0].seriesId, 'series-1');
  assert.equal(payloads[0].reason, 'schedule');
  assert.equal(payloads[0].maxChapters, 5);
});
