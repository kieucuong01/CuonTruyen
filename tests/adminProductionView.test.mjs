import assert from 'node:assert/strict';
import test from 'node:test';

import {
  productionStatusClass,
  productionStatusForSeries,
  productionStatusIcon,
  renderAdminProductionBadge,
  renderProductionPipelineStep,
  renderProductionProgressView,
  renderProductionStepProgress,
  productionJobMessage,
  productionStepIcon
} from '../public/routes/adminProductionView.mjs';

test('admin production view resolves per-series status without route closure state', () => {
  const status = {
    statuses: {
      'series-1': { state: 'ok', label: 'Ready' }
    }
  };

  assert.deepEqual(
    productionStatusForSeries({ id: 'series-1' }, status),
    { state: 'ok', label: 'Ready' }
  );
  assert.equal(productionStatusForSeries({ id: 'missing' }, status), null);
});

test('admin production badge escapes status text and summarizes image sync state', () => {
  const html = renderAdminProductionBadge(
    { id: 'series-1' },
    {
      statuses: {
        'series-1': {
          state: 'syncing',
          label: 'Sync <now>',
          images: { uploaded: 5, total: 10 },
          sync: { percent: 50, eta: '2 <min>' }
        }
      }
    }
  );

  assert.match(html, /admin-production-badge is-syncing/);
  assert.match(html, /Sync &lt;now&gt;/);
  assert.match(html, /50%/);
  assert.match(html, /ETA 2 &lt;min&gt;/);
  assert.doesNotMatch(html, /Sync <now>/);
});

test('admin production status class and icon mapping is stable', () => {
  assert.equal(productionStatusClass('ok'), 'ok');
  assert.equal(productionStatusClass('syncing'), 'syncing');
  assert.equal(productionStatusClass('missing-images'), 'warning');
  assert.equal(productionStatusClass('not-public'), 'draft');
  assert.equal(productionStatusClass('other'), 'unchecked');

  assert.equal(productionStatusIcon('ok'), '&#10003;');
  assert.equal(productionStatusIcon('syncing'), '...');
  assert.equal(productionStatusIcon('missing-images'), '!');
  assert.equal(productionStatusIcon('other'), '&#9675;');
});

test('production pipeline step renders escaped actions for job and check buttons', () => {
  const jobStep = renderProductionPipelineStep(
    { id: 'series<1>' },
    {
      key: 'sync-images',
      label: 'Sync <images>',
      description: 'Upload & retry',
      button: 'Run',
      steps: ['sync-images']
    },
    'https://example.test/truyen/a'
  );

  assert.match(jobStep, /production-pipeline-step is-sync-images/);
  assert.match(jobStep, /Sync &lt;images&gt;/);
  assert.match(jobStep, /Upload &amp; retry/);
  assert.match(jobStep, /data-production-step="series&lt;1&gt;"/);
  assert.match(jobStep, /data-steps="sync-images"/);

  const checkStep = renderProductionPipelineStep(
    { id: 'series-1' },
    {
      key: 'production-check',
      label: 'Check',
      description: 'Open production',
      button: 'Check',
      check: true,
      disabled: true
    },
    'https://example.test/truyen/a?x=<bad>'
  );

  assert.match(checkStep, /data-production-check="series-1"/);
  assert.match(checkStep, /data-production-url="https:\/\/example.test\/truyen\/a\?x=&lt;bad&gt;"/);
  assert.match(checkStep, /disabled/);
});

test('production progress view summarizes steps, logs, progress, and escaped output', () => {
  const view = renderProductionProgressView({
    status: 'running',
    steps: [
      { key: 'optimize', label: 'Optimize', status: 'completed', output: 'line1\nDone <ok>' },
      {
        key: 'sync',
        label: 'Sync <images>',
        description: 'Upload & verify',
        status: 'running',
        progress: {
          total: 10,
          checked: 5,
          uploaded: 3,
          skipped: 1,
          cachedSkipped: 2,
          failed: 1,
          ratePerMinute: 12.34,
          eta: '2 <min>',
          concurrency: 4
        }
      }
    ],
    logs: [
      { text: 'old' },
      { text: 'log <one>' },
      { text: 'log two' },
      { text: 'log three' },
      { text: 'log four' },
      { text: 'log five' },
      { text: 'log six' }
    ]
  });

  assert.equal(view.className, 'status-line production-progress');
  assert.match(view.html, /Đang chạy: Sync &lt;images&gt;/);
  assert.match(view.html, /1\/2 bước - running/);
  assert.match(view.html, /width:50%/);
  assert.match(view.html, /Upload &amp; verify/);
  assert.match(view.html, /Đã kiểm tra: 5\/10/);
  assert.match(view.html, /Skip cache local: 2/);
  assert.match(view.html, /Tốc độ: 12,3 file\/phút/);
  assert.match(view.html, /ETA: 2 &lt;min&gt;/);
  assert.match(view.html, /log &lt;one&gt;/);
  assert.doesNotMatch(view.html, /<images>/);
  assert.doesNotMatch(view.html, /old/);
});

test('production progress view marks failed jobs and exposes stable message/icon helpers', () => {
  const view = renderProductionProgressView({
    status: 'failed',
    error: 'Failed <job>',
    steps: [{ key: 'sync', label: 'Sync', status: 'failed', error: 'Step <bad>' }]
  });

  assert.equal(view.className, 'status-line production-progress error');
  assert.match(view.html, /Failed &lt;job&gt;/);
  assert.match(view.html, /Step &lt;bad&gt;/);
  assert.equal(productionJobMessage({ status: 'completed', result: { message: 'Done' } }), 'Done');
  assert.equal(productionJobMessage({ status: 'failed', error: 'Boom' }), 'Boom');
  assert.equal(productionJobMessage({ status: 'running' }, { label: 'Sync' }), 'Đang chạy: Sync');
  assert.equal(productionStepIcon('completed'), '✓');
  assert.equal(productionStepIcon('running'), '…');
  assert.equal(productionStepIcon('failed'), '!');
  assert.equal(productionStepIcon('pending'), '○');
});

test('production step progress hides empty progress and escapes aria labels', () => {
  assert.equal(renderProductionStepProgress({ progress: {} }), '');

  const html = renderProductionStepProgress({
    label: 'Sync <cdn>',
    progress: { total: 4, checked: 1 }
  });

  assert.match(html, /aria-label="Tiến độ Sync &lt;cdn&gt;"/);
  assert.match(html, /width:25%/);
});
