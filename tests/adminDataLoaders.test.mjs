import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminDataLoaders } from '../public/routes/adminDataLoaders.mjs';

test('admin data loaders call the expected API endpoints with admin headers', async () => {
  const calls = [];
  const loaders = createAdminDataLoaders({
    adminHeaders: () => ({ authorization: 'Bearer test-token' }),
    fetchJson: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, url };
    }
  });

  await loaders.loadAdminCatalog();
  await loaders.loadAdminBulletin();
  await loaders.loadAdminAnalytics('7d');
  await loaders.loadAdminProductionStatus();

  assert.deepEqual(calls.map((call) => call.url), [
    '/api/admin/series',
    '/api/admin/bulletin/messages?limit=40',
    '/api/admin/analytics/summary?range=7d',
    '/api/admin/production-status'
  ]);
  assert.deepEqual(calls.map((call) => call.options.headers), [
    { authorization: 'Bearer test-token' },
    { authorization: 'Bearer test-token' },
    { authorization: 'Bearer test-token' },
    { authorization: 'Bearer test-token' }
  ]);
});

test('admin optional loaders return safe fallbacks when optional endpoints fail', async () => {
  const loaders = createAdminDataLoaders({
    adminHeaders: () => ({}),
    fetchJson: async (url) => {
      if (url === '/api/admin/series') return { series: [] };
      throw new Error(`offline: ${url}`);
    }
  });

  assert.deepEqual(await loaders.loadAdminBulletin(), { messages: [] });
  assert.equal(await loaders.loadAdminAnalytics(), null);
  assert.deepEqual(await loaders.loadAdminProductionStatus(), { statuses: {}, stateFileExists: false });
});

test('admin analytics loader safely encodes range values', async () => {
  let requestedUrl = '';
  const loaders = createAdminDataLoaders({
    adminHeaders: () => ({}),
    fetchJson: async (url) => {
      requestedUrl = url;
      return {};
    }
  });

  await loaders.loadAdminAnalytics('30 days & more');
  assert.equal(requestedUrl, '/api/admin/analytics/summary?range=30%20days%20%26%20more');
});
