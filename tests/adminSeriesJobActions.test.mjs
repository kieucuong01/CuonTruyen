import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminSeriesJobActions } from '../public/routes/adminSeriesJobActions.mjs';

function createStatus() {
  return {
    className: '',
    textContent: ''
  };
}

function createButton(dataset = {}) {
  return {
    dataset,
    disabled: false,
    textContent: '',
    addEventListener() {}
  };
}

function createActions(overrides = {}) {
  const status = createStatus();
  const calls = [];
  const rendered = [];
  const flashes = [];
  const invalidations = [];
  const app = {
    querySelector(selector) {
      calls.push(['querySelector', selector]);
      return status;
    }
  };
  const actions = createAdminSeriesJobActions({
    adminHeaders: () => ({ authorization: 'Bearer admin' }),
    app,
    cssEscape: (value) => String(value).replace(/"/g, '\\"'),
    fetchJson: async (url, options) => {
      calls.push(['fetchJson', url, options]);
      return { job: { id: 'job-1' }, reused: false };
    },
    invalidateContentCache: () => invalidations.push('invalidate'),
    pollImportJob: async () => ({ id: 'series-1', title: 'Series 1', importSummary: { newChapterCount: 2, refreshedExistingChapterCount: 5 } }),
    renderAdmin: async () => rendered.push(['admin']),
    renderAdminSeriesDetail: async (seriesId) => rendered.push(['detail', seriesId]),
    setAdminFlashMessage: (message) => flashes.push(message),
    ...overrides
  });
  return { actions, calls, flashes, invalidations, rendered, status };
}

test('update chapters action creates a scoped job and returns to admin dashboard', async () => {
  const { actions, calls, flashes, invalidations, rendered, status } = createActions();
  const button = createButton({ updateChapters: 'series-1' });

  await actions.handleUpdateChapters({ preventDefault() {}, currentTarget: button });

  const fetchCall = calls.find((call) => call[0] === 'fetchJson');
  assert.equal(fetchCall[1], '/api/admin/series/series-1/update-chapters');
  assert.equal(fetchCall[2].method, 'POST');
  assert.deepEqual(fetchCall[2].headers, { authorization: 'Bearer admin' });
  assert.equal(fetchCall[2].body, '{}');
  assert.equal(status.className, 'status-line admin-wide admin-update-status');
  assert.equal(flashes[0].includes('2'), true);
  assert.deepEqual(invalidations, ['invalidate']);
  assert.deepEqual(rendered, [['admin']]);
});

test('refresh image URLs action navigates back to the series detail after polling', async () => {
  const { actions, calls, flashes, rendered, status } = createActions();
  const button = createButton({ refreshImageUrls: 'series-1' });

  await actions.handleRefreshImageUrls({ preventDefault() {}, currentTarget: button });

  const fetchCall = calls.find((call) => call[0] === 'fetchJson');
  assert.equal(fetchCall[1], '/api/admin/series/series-1/refresh-image-urls');
  assert.equal(fetchCall[2].method, 'POST');
  assert.equal(status.className, 'status-line admin-wide admin-update-status');
  assert.equal(flashes[0].includes('5'), true);
  assert.deepEqual(rendered, [['detail', 'series-1']]);
});

test('series job actions restore button state when update or refresh fails', async () => {
  const { actions, status } = createActions({
    fetchJson: async () => {
      throw new Error('network down');
    }
  });

  const updateButton = createButton({ updateChapters: 'series-1' });
  await actions.handleUpdateChapters({ preventDefault() {}, currentTarget: updateButton });
  assert.equal(status.className, 'status-line admin-wide admin-update-status error');
  assert.equal(status.textContent, 'network down');
  assert.equal(updateButton.disabled, false);
  assert.equal(updateButton.textContent, 'Cập nhật chapter mới');

  const refreshButton = createButton({ refreshImageUrls: 'series-1' });
  await actions.handleRefreshImageUrls({ preventDefault() {}, currentTarget: refreshButton });
  assert.equal(refreshButton.disabled, false);
  assert.equal(refreshButton.textContent, 'Refresh URL ảnh');
});
