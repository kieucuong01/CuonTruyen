import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAdminJobPollers,
  delay,
  renderImportProgressStatus,
  renderProductionProgressStatus
} from '../public/routes/adminJobPolling.mjs';
import { renderImportProgressView } from '../public/routes/adminImportProgressView.mjs';
import { renderProductionProgressView } from '../public/routes/adminProductionView.mjs';

function createStatus({ isAdminUpdateStatus = false } = {}) {
  return {
    className: '',
    innerHTML: '',
    hasAttribute(name) {
      return isAdminUpdateStatus && name === 'data-update-chapters-status';
    }
  };
}

test('job progress status adapters apply import and production view output', () => {
  const importJob = { status: 'running', progress: { chaptersTotal: 2, chaptersDone: 1 } };
  const importStatus = createStatus({ isAdminUpdateStatus: true });
  renderImportProgressStatus(importStatus, importJob);
  const expectedImport = renderImportProgressView(importJob, { isAdminUpdateStatus: true });
  assert.equal(importStatus.className, expectedImport.className);
  assert.equal(importStatus.innerHTML, expectedImport.html);

  const productionJob = { status: 'completed', steps: [{ name: 'sync', status: 'completed' }] };
  const productionStatus = createStatus();
  renderProductionProgressStatus(productionStatus, productionJob);
  const expectedProduction = renderProductionProgressView(productionJob);
  assert.equal(productionStatus.className, expectedProduction.className);
  assert.equal(productionStatus.innerHTML, expectedProduction.html);
});

test('admin import job poller waits, renders progress, returns series, and navigates when requested', async () => {
  const calls = [];
  const waits = [];
  let navigatedTo = '';
  const jobs = [
    { status: 'running', progress: { imagesDone: 1, imagesTotal: 2 } },
    { status: 'completed', result: { series: { id: 'series-1', title: 'Series 1' } } }
  ];
  const status = createStatus({ isAdminUpdateStatus: true });
  const { pollImportJob } = createAdminJobPollers({
    adminHeaders: () => ({ authorization: 'Bearer token' }),
    fetchJson: async (url, options) => {
      calls.push({ url, options });
      return jobs.shift();
    },
    navigateTo: (url) => {
      navigatedTo = url;
    },
    wait: async (ms) => {
      waits.push(ms);
    }
  });

  const series = await pollImportJob('job 1', status, { navigateOnComplete: true });

  assert.equal(series.id, 'series-1');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, '/api/admin/import-jobs/job%201');
  assert.deepEqual(calls[0].options.headers, { authorization: 'Bearer token' });
  assert.deepEqual(waits, [1500]);
  assert.equal(navigatedTo, '/admin/series/series-1');
  assert.match(status.className, /admin-update-status/);
  assert.match(status.innerHTML, /Phase: completed/);
});

test('admin production job poller reports failed jobs and uses the configured interval', async () => {
  const waits = [];
  const jobs = [
    { status: 'running', steps: [] },
    { status: 'failed', error: 'boom' }
  ];
  const status = createStatus();
  const { pollProductionJob } = createAdminJobPollers({
    adminHeaders: () => ({}),
    fetchJson: async () => jobs.shift(),
    wait: async (ms) => {
      waits.push(ms);
    }
  });

  await assert.rejects(() => pollProductionJob('prod-job', status), /boom/);
  assert.deepEqual(waits, [1200]);
  assert.match(status.className, /production-progress/);
  assert.match(status.innerHTML, /failed/);
});

test('delay resolves after normalizing invalid and negative durations', async () => {
  const started = Date.now();
  await delay(-50);
  assert.equal(Date.now() >= started, true);
});
