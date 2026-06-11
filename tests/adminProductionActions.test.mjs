import assert from 'node:assert/strict';
import test from 'node:test';

import { createAdminProductionActions } from '../public/routes/adminProductionActions.mjs';

function createStatus() {
  return {
    className: '',
    innerHTML: '',
    textContent: ''
  };
}

function createButton(dataset = {}, textContent = '') {
  return {
    dataset,
    disabled: false,
    listeners: {},
    textContent,
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    }
  };
}

function createActions(overrides = {}) {
  const status = createStatus();
  const calls = [];
  const opened = [];
  const app = {
    querySelector(selector) {
      calls.push(['querySelector', selector]);
      return status;
    }
  };
  const actions = createAdminProductionActions({
    adminHeaders: () => ({ authorization: 'Bearer admin' }),
    app,
    cssEscape: (value) => String(value).replace(/"/g, '\\"'),
    fetchJson: async (url, options) => {
      calls.push(['fetchJson', url, options]);
      if (url === '/api/admin/production-check') {
        return { ok: true, status: 200, checks: [{ ok: true, label: 'reader' }] };
      }
      return { job: { id: 'job-1' }, reused: false };
    },
    openWindow: (...args) => opened.push(args),
    pollProductionJob: async (jobId, target) => {
      calls.push(['pollProductionJob', jobId, target]);
      return { id: jobId, status: 'completed', steps: [] };
    },
    renderProductionProgressStatus: (target, job) => {
      target.className = `rendered-${job.status}`;
      target.textContent = `job ${job.id}`;
    },
    ...overrides
  });
  return { actions, calls, opened, status };
}

test('production publish action starts the full pipeline and renders completed status', async () => {
  const { actions, calls, status } = createActions();
  const button = createButton({ publishProduction: 'series-1' }, 'Sync production');

  await actions.handleProductionPublish({ currentTarget: button });

  const fetchCall = calls.find((call) => call[0] === 'fetchJson');
  assert.equal(fetchCall[1], '/api/admin/series/series-1/publish-production');
  assert.equal(fetchCall[2].method, 'POST');
  assert.deepEqual(fetchCall[2].headers, { authorization: 'Bearer admin' });
  assert.equal(fetchCall[2].body, '{"steps":[]}');
  assert.equal(calls.some((call) => call[0] === 'pollProductionJob' && call[1] === 'job-1'), true);
  assert.equal(status.className, 'rendered-completed');
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, 'Sync lai production');
});

test('production step action parses selected steps before starting a scoped job', async () => {
  const { actions, calls } = createActions();
  const button = createButton({
    productionStep: 'series-2',
    steps: ' optimize, sync-images ,, sync-catalog-db '
  }, 'Run step');

  await actions.handleProductionStep({ currentTarget: button });

  const fetchCall = calls.find((call) => call[0] === 'fetchJson');
  assert.equal(fetchCall[1], '/api/admin/series/series-2/publish-production');
  assert.equal(fetchCall[2].body, '{"steps":["optimize","sync-images","sync-catalog-db"]}');
  assert.equal(button.textContent, 'Chay lai buoc nay');
});

test('production check action posts the URL, renders success, and opens the public page', async () => {
  const { actions, calls, opened, status } = createActions();
  const button = createButton({
    productionCheck: 'series-3',
    productionUrl: 'https://cuontruyen.vercel.app/truyen/demo'
  }, 'Check');

  await actions.handleProductionCheck({ currentTarget: button });

  const fetchCall = calls.find((call) => call[0] === 'fetchJson');
  assert.equal(fetchCall[1], '/api/admin/production-check');
  assert.equal(fetchCall[2].method, 'POST');
  assert.equal(fetchCall[2].body, '{"url":"https://cuontruyen.vercel.app/truyen/demo","seriesId":"series-3"}');
  assert.equal(status.className, 'status-line admin-wide production-publish-status success');
  assert.match(status.innerHTML, /Production OK/);
  assert.deepEqual(opened, [['https://cuontruyen.vercel.app/truyen/demo', '_blank', 'noopener,noreferrer']]);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, 'Check');
});

test('production actions restore button state and render API errors', async () => {
  const { actions, status } = createActions({
    fetchJson: async () => {
      throw new Error('network down');
    }
  });
  const button = createButton({ publishProduction: 'series-4' }, 'Sync');

  await actions.handleProductionPublish({ currentTarget: button });

  assert.equal(status.className, 'status-line admin-wide production-publish-status error');
  assert.match(status.innerHTML, /Khong chay duoc production pipeline/);
  assert.match(status.innerHTML, /network down/);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, 'Sync');
});
