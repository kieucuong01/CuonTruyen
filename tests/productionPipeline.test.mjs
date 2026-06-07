import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProductionPublishSteps,
  productionPublishPreflightError
} from '../server/productionPublishJobs.mjs';

test('production publish defaults to scoped per-series steps only', () => {
  const steps = buildProductionPublishSteps('series-123');

  assert.deepEqual(steps.map((step) => step.key), [
    'optimize',
    'sync-images',
    'sync-catalog-db'
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

  const syncCatalogDb = steps.find((step) => step.key === 'sync-catalog-db');
  assert.deepEqual(syncCatalogDb.command.slice(1), [
    'scripts/sync-catalog-to-production-db.mjs',
    '--series-id',
    'series-123',
    '--apply'
  ]);
});

test('production publish ignores removed file publish steps', () => {
  const steps = buildProductionPublishSteps('series-123', { requestedSteps: ['legacy-json-export', 'legacy-json-sync'] });

  assert.deepEqual(steps.map((step) => step.key), []);
});

test('production publish can retry a single selected step', () => {
  const steps = buildProductionPublishSteps('series-123', { requestedSteps: ['sync-images'] });

  assert.deepEqual(steps.map((step) => step.key), ['sync-images']);
  assert.equal(steps[0].command.includes('--series-id'), true);
  assert.equal(steps[0].command.includes('series-123'), true);
});

test('production publish preflight requires target DB for full DB-aware publish', () => {
  const previousProductionUrl = process.env.PRODUCTION_CATALOG_DATABASE_URL;
  const previousProductionDatabaseUrl = process.env.PRODUCTION_DATABASE_URL;
  delete process.env.PRODUCTION_CATALOG_DATABASE_URL;
  delete process.env.PRODUCTION_DATABASE_URL;

  try {
    const error = productionPublishPreflightError([]);
    assert.match(error.error, /Missing PRODUCTION_CATALOG_DATABASE_URL/);
    assert.equal(productionPublishPreflightError(['sync-images']), null);
  } finally {
    if (previousProductionUrl === undefined) delete process.env.PRODUCTION_CATALOG_DATABASE_URL;
    else process.env.PRODUCTION_CATALOG_DATABASE_URL = previousProductionUrl;
    if (previousProductionDatabaseUrl === undefined) delete process.env.PRODUCTION_DATABASE_URL;
    else process.env.PRODUCTION_DATABASE_URL = previousProductionDatabaseUrl;
  }
});
