import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminImportActions } from '../public/routes/adminImportActions.mjs';

function createStatus() {
  return {
    className: '',
    textContent: ''
  };
}

function createButton() {
  return {
    disabled: false,
    textContent: ''
  };
}

function createForm(values = {}) {
  const button = createButton();
  return {
    button,
    values: {
      url: 'https://example.test/series',
      maxChapters: '3',
      maxPages: '0',
      assetMode: 'image_url',
      ...values
    },
    querySelector(selector) {
      if (selector === 'button[type="submit"]') return button;
      return null;
    }
  };
}

function createActions(overrides = {}) {
  const status = createStatus();
  const calls = [];
  const flashes = [];
  const controls = [];
  const invalidations = [];
  let renderCount = 0;
  const app = {
    querySelector(selector) {
      calls.push(['querySelector', selector]);
      if (selector === '[data-status]') return status;
      return null;
    }
  };
  const actions = createAdminImportActions({
    adminHeaders: () => ({ authorization: 'Bearer admin' }),
    app,
    clearControlPending: () => controls.push(['clear']),
    fetchJson: async (url, options) => {
      calls.push(['fetchJson', url, options]);
      return { job: { id: 'job-1' }, reused: false };
    },
    formDataFactory: (form) => ({
      get(name) {
        return form.values[name];
      }
    }),
    invalidateContentCache: () => invalidations.push('invalidate'),
    pollImportJob: async (jobId, target, options) => {
      calls.push(['pollImportJob', jobId, target, options]);
      return { id: 'series-1', title: 'Series One' };
    },
    renderAdmin: async () => {
      renderCount += 1;
    },
    setAdminFlashMessage: (message) => flashes.push(message),
    setControlPending: (button) => controls.push(['pending', button]),
    splitList: (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean),
    ...overrides
  });
  return {
    actions,
    calls,
    controls,
    flashes,
    invalidations,
    get renderCount() {
      return renderCount;
    },
    status
  };
}

test('admin import action rejects empty URL input before posting', async () => {
  const { actions, calls, controls, status } = createActions();
  const form = createForm({ url: '   ' });

  await actions.handleImport({ preventDefault() {}, currentTarget: form });

  assert.equal(status.className, 'status-line error');
  assert.equal(status.textContent, 'Vui long nhap URL truyen hop le.');
  assert.equal(calls.some((call) => call[0] === 'fetchJson'), false);
  assert.deepEqual(controls, []);
});

test('admin import action posts payload, polls one job, flashes, invalidates, and rerenders', async () => {
  const context = createActions();
  const { actions, calls, controls, flashes, invalidations, status } = context;
  const form = createForm();

  await actions.handleImport({ preventDefault() {}, currentTarget: form });

  const fetchCall = calls.find((call) => call[0] === 'fetchJson');
  assert.equal(fetchCall[1], '/api/admin/import-jobs');
  assert.equal(fetchCall[2].method, 'POST');
  assert.deepEqual(fetchCall[2].headers, { authorization: 'Bearer admin' });
  assert.equal(fetchCall[2].body, '{"urls":["https://example.test/series"],"maxChapters":3,"maxPages":0,"assetMode":"image_url","publish":true}');
  assert.equal(calls.some((call) => call[0] === 'pollImportJob' && call[1] === 'job-1'), true);
  assert.deepEqual(flashes, ['Da crawl xong Series One.']);
  assert.deepEqual(invalidations, ['invalidate']);
  assert.equal(context.renderCount, 1);
  assert.equal(status.className, 'status-line');
  assert.equal(status.textContent, 'Dang tao job crawl...');
  assert.deepEqual(controls.map((item) => item[0]), ['pending', 'clear']);
});

test('admin import action summarizes batch jobs without polling each job', async () => {
  const context = createActions({
    fetchJson: async () => ({
      jobs: [
        { job: { id: 'job-1' } },
        { job: { id: 'job-2' } }
      ]
    })
  });
  const form = createForm({ url: 'https://one.test/a, https://two.test/b' });

  await context.actions.handleImport({ preventDefault() {}, currentTarget: form });

  assert.equal(context.calls.some((call) => call[0] === 'pollImportJob'), false);
  assert.deepEqual(context.flashes, ['Đã tạo 2 job crawl.']);
  assert.equal(context.status.textContent, 'Đã tạo 2 job crawl. Theo dõi trong bảng Trạng thái crawl.');
  assert.equal(context.renderCount, 1);
});

test('admin import action renders request errors and clears pending state', async () => {
  const { actions, controls, status } = createActions({
    fetchJson: async () => {
      throw new Error('network down');
    }
  });

  await actions.handleImport({ preventDefault() {}, currentTarget: createForm() });

  assert.equal(status.className, 'status-line error');
  assert.equal(status.textContent, 'network down');
  assert.deepEqual(controls.map((item) => item[0]), ['pending', 'clear']);
});
