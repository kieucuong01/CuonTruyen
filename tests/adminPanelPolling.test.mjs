import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAdminPanelPollers,
  renderCrawlQueueStatusTarget,
  renderS3SyncStatusTarget
} from '../public/routes/adminPanelPolling.mjs';
import { renderCrawlQueueStatusView } from '../public/routes/adminCrawlQueueView.mjs';
import { renderS3SyncStatusView } from '../public/routes/adminS3SyncView.mjs';

function createTarget({ retryButton = null } = {}) {
  return {
    className: '',
    htmlInserts: [],
    innerHTML: '',
    isConnected: true,
    textContent: '',
    insertAdjacentHTML(position, html) {
      this.htmlInserts.push({ position, html });
    },
    querySelector(selector) {
      if (selector === '[data-s3-retry-failed]') return retryButton;
      return null;
    }
  };
}

function createButton() {
  return {
    disabled: false,
    listeners: {},
    textContent: '',
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    }
  };
}

test('admin panel status adapters apply S3 and crawl queue view output', () => {
  const s3Status = { status: 'running', total: 10, checked: 3, updatedAt: new Date().toISOString() };
  const s3Target = createTarget();
  renderS3SyncStatusTarget(s3Target, s3Status);
  const expectedS3 = renderS3SyncStatusView(s3Status);
  assert.equal(s3Target.className, expectedS3.className);
  assert.equal(s3Target.innerHTML, expectedS3.html);

  const crawlSummary = { counts: { queued: 1 }, worker: { embeddedEnabled: true, active: false } };
  const crawlTarget = createTarget();
  renderCrawlQueueStatusTarget(crawlTarget, crawlSummary);
  const expectedCrawl = renderCrawlQueueStatusView(crawlSummary);
  assert.equal(crawlTarget.className, expectedCrawl.className);
  assert.equal(crawlTarget.innerHTML, expectedCrawl.html);
});

test('S3 sync panel polling fetches status, registers retry failed, and refreshes after retry', async () => {
  const retryButton = createButton();
  const target = createTarget({ retryButton });
  const app = {
    querySelector(selector) {
      assert.equal(selector, '[data-s3-sync-status]');
      return target;
    }
  };
  const calls = [];
  const intervals = [];
  const pollers = createAdminPanelPollers({
    adminHeaders: () => ({ authorization: 'Bearer admin' }),
    app,
    escapeHtml: (value) => String(value).replace(/</g, '&lt;'),
    fetchJson: async (url, options = {}) => {
      calls.push({ url, options });
      if (url === '/api/admin/s3-sync/status') {
        return { status: 'failed', failedItems: [{ key: 'a.webp', error: 'timeout' }] };
      }
      return { retryCount: 2 };
    },
    setIntervalFn: (handler, ms) => {
      intervals.push({ handler, ms });
      return 77;
    }
  });

  await pollers.bindS3SyncStatus();
  assert.equal(intervals[0].ms, 2500);
  assert.equal(calls[0].url, '/api/admin/s3-sync/status');
  assert.deepEqual(calls[0].options.headers, { authorization: 'Bearer admin' });
  assert.equal(typeof retryButton.listeners.click, 'function');

  await retryButton.listeners.click();
  assert.equal(calls[1].url, '/api/admin/s3-sync/retry-failed');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[2].url, '/api/admin/s3-sync/status');
  assert.equal(retryButton.disabled, false);
  assert.equal(retryButton.textContent, 'Retry file thiếu');
  assert.match(target.htmlInserts.at(-1).html, /2/);
});

test('crawl queue panel polling fetches summary, wakes crawler, and clears stale timers', async () => {
  const wakeButton = createButton();
  const target = createTarget();
  const app = {
    querySelector(selector) {
      if (selector === '[data-crawl-queue-status]') return target;
      if (selector === '[data-crawl-queue-wake]') return wakeButton;
      return null;
    }
  };
  const calls = [];
  const intervals = [];
  const cleared = [];
  const pollers = createAdminPanelPollers({
    adminHeaders: () => ({}),
    app,
    escapeHtml: (value) => String(value),
    fetchJson: async (url, options = {}) => {
      calls.push({ url, options });
      return { counts: { queued: 0 }, worker: { embeddedEnabled: true, active: false } };
    },
    clearIntervalFn: (timer) => cleared.push(timer),
    setIntervalFn: (handler, ms) => {
      intervals.push({ handler, ms });
      return 99;
    }
  });

  await pollers.bindCrawlQueueStatus();
  assert.equal(intervals[0].ms, 3000);
  assert.equal(calls[0].url, '/api/admin/import-jobs/summary');
  assert.equal(typeof wakeButton.listeners.click, 'function');

  await wakeButton.listeners.click();
  assert.equal(calls[1].url, '/api/admin/import-jobs/wake');
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(wakeButton.disabled, false);
  assert.equal(wakeButton.textContent, 'Đánh thức crawler');

  target.isConnected = false;
  await intervals[0].handler();
  assert.deepEqual(cleared, [99]);
});
