import assert from 'node:assert/strict';
import test from 'node:test';

import {
  productionStatusClass,
  productionStatusForSeries,
  productionStatusIcon,
  renderAdminProductionBadge,
  renderProductionPipelineStep
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
