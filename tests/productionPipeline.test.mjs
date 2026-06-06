import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProductionPublishSteps } from '../server/productionPublishJobs.mjs';

test('production publish defaults to scoped per-series steps only', () => {
  const steps = buildProductionPublishSteps('series-123');

  assert.deepEqual(steps.map((step) => step.key), [
    'optimize',
    'sync-images',
    'export-static-api',
    'sync-static-api'
  ]);

  const syncImages = steps.find((step) => step.key === 'sync-images');
  assert.deepEqual(syncImages.command.slice(1), [
    'scripts/sync-vietnix-s3.mjs',
    '--images-only',
    '--catalog-only',
    '--series-id',
    'series-123',
    '--apply'
  ]);

  const syncStaticApi = steps.find((step) => step.key === 'sync-static-api');
  assert.deepEqual(syncStaticApi.command.slice(1), [
    'scripts/sync-vietnix-s3.mjs',
    '--static-api-only',
    '--apply'
  ]);
});

test('production publish can retry a single selected step', () => {
  const steps = buildProductionPublishSteps('series-123', { requestedSteps: ['sync-images'] });

  assert.deepEqual(steps.map((step) => step.key), ['sync-images']);
  assert.equal(steps[0].command.includes('--series-id'), true);
  assert.equal(steps[0].command.includes('series-123'), true);
});
