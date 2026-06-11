import assert from 'node:assert/strict';
import test from 'node:test';

import {
  importJobsFromResult,
  importJobsFlashMessage,
  parseProductionSteps,
  refreshImageUrlsFlashMessage,
  resolveImportJobSeries,
  updateChaptersFlashMessage
} from '../public/routes/adminJobHelpers.mjs';

test('importJobsFromResult normalizes batch and single job responses', () => {
  assert.deepEqual(importJobsFromResult({
    jobs: [{ job: { id: 'j1' }, reused: false }]
  }), [{ job: { id: 'j1' }, reused: false }]);

  assert.deepEqual(importJobsFromResult({
    job: { id: 'j2' },
    reused: true
  }), [{ job: { id: 'j2' }, reused: true }]);

  assert.deepEqual(importJobsFromResult({}), []);
});

test('importJobsFlashMessage handles single-series and batch jobs', () => {
  assert.equal(importJobsFlashMessage([{ job: { id: 'j1' } }], { title: 'Demo' }), 'Da crawl xong Demo.');
  assert.equal(importJobsFlashMessage([{ job: { id: 'j1' } }], {}), 'Da crawl xong truyen.');
  assert.equal(importJobsFlashMessage([{ job: { id: 'j1' } }, { job: { id: 'j2' } }]), 'Đã tạo 2 job crawl.');
});

test('update and refresh flash messages summarize import results', () => {
  assert.equal(updateChaptersFlashMessage({
    title: 'Demo',
    importSummary: { newChapterCount: 3 }
  }), 'Đã thêm 3 chapter mới cho Demo.');

  assert.equal(updateChaptersFlashMessage({
    title: 'Demo',
    importSummary: { newChapterCount: 0 }
  }), 'Chưa có chapter mới cho Demo.');

  assert.equal(refreshImageUrlsFlashMessage({
    importSummary: {
      refreshedExistingChapterCount: 4,
      newChapterCount: 2
    }
  }), 'Đã refresh URL ảnh cho 4 chapter và thêm 2 chapter mới. Hãy kiểm tra reader local rồi bấm Sync DB để cập nhật production.');
});

test('resolveImportJobSeries unwraps job result variants', () => {
  assert.deepEqual(resolveImportJobSeries({ result: { series: { id: 's1' } } }), { id: 's1' });
  assert.deepEqual(resolveImportJobSeries({ series: { id: 's2' } }), { id: 's2' });
  assert.deepEqual(resolveImportJobSeries({ result: { id: 's3' } }), { id: 's3' });
  assert.deepEqual(resolveImportJobSeries({}), {});
});

test('parseProductionSteps normalizes comma-delimited step lists', () => {
  assert.deepEqual(parseProductionSteps(' optimize, sync-images ,, sync-catalog-db '), [
    'optimize',
    'sync-images',
    'sync-catalog-db'
  ]);
  assert.deepEqual(parseProductionSteps(''), []);
});
