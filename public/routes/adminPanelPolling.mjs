import { renderCrawlQueueStatusView } from './adminCrawlQueueView.mjs';
import { renderS3SyncStatusView } from './adminS3SyncView.mjs';

export function renderCrawlQueueStatusTarget(target, summary = {}) {
  const view = renderCrawlQueueStatusView(summary);
  target.className = view.className;
  target.innerHTML = view.html;
}

export function renderS3SyncStatusTarget(target, status = {}) {
  const view = renderS3SyncStatusView(status);
  target.className = view.className;
  target.innerHTML = view.html;
}

export function createAdminPanelPollers({
  adminHeaders,
  app,
  clearIntervalFn = clearInterval,
  escapeHtml,
  fetchJson,
  setIntervalFn = setInterval
} = {}) {
  let s3SyncPollTimer = null;
  let crawlQueuePollTimer = null;

  function bindS3SyncStatus() {
    const target = app.querySelector('[data-s3-sync-status]');
    if (!target) return Promise.resolve();
    if (s3SyncPollTimer) clearIntervalFn(s3SyncPollTimer);

    const refresh = async () => {
      if (!target.isConnected) {
        clearIntervalFn(s3SyncPollTimer);
        s3SyncPollTimer = null;
        return;
      }
      try {
        const status = await fetchJson('/api/admin/s3-sync/status', { headers: adminHeaders() });
        renderS3SyncStatusTarget(target, status);
        bindS3RetryFailed(target, refresh);
      } catch (error) {
        target.className = 'status-line s3-sync-status error';
        target.textContent = `Không đọc được tiến trình S3: ${error.message}`;
      }
    };

    const refreshPromise = refresh();
    s3SyncPollTimer = setIntervalFn(refresh, 2500);
    return refreshPromise;
  }

  function bindS3RetryFailed(target, refresh) {
    const button = target.querySelector('[data-s3-retry-failed]');
    if (!button) return;
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'Đang tạo retry...';
      try {
        const result = await fetchJson('/api/admin/s3-sync/retry-failed', {
          method: 'POST',
          headers: adminHeaders()
        });
        target.className = 'status-line s3-sync-status success';
        target.insertAdjacentHTML('afterbegin', `<p class="muted">Đã tạo job retry ${Number(result.retryCount || 0)} file thiếu/lỗi trên S3.</p>`);
        await refresh();
      } catch (error) {
        target.className = 'status-line s3-sync-status error';
        target.insertAdjacentHTML('afterbegin', `<p class="muted">Không thể retry file thiếu: ${escapeHtml(error.message)}</p>`);
      } finally {
        button.disabled = false;
        button.textContent = 'Retry file thiếu';
      }
    });
  }

  function bindCrawlQueueStatus() {
    const target = app.querySelector('[data-crawl-queue-status]');
    const wakeButton = app.querySelector('[data-crawl-queue-wake]');
    if (!target) return Promise.resolve();
    if (crawlQueuePollTimer) clearIntervalFn(crawlQueuePollTimer);

    const refresh = async () => {
      if (!target.isConnected) {
        clearIntervalFn(crawlQueuePollTimer);
        crawlQueuePollTimer = null;
        return;
      }
      try {
        const summary = await fetchJson('/api/admin/import-jobs/summary', { headers: adminHeaders() });
        renderCrawlQueueStatusTarget(target, summary);
      } catch (error) {
        target.className = 'status-line crawl-queue-status error';
        target.textContent = `Không đọc được queue crawl: ${error.message}`;
      }
    };

    wakeButton?.addEventListener('click', async () => {
      wakeButton.disabled = true;
      wakeButton.textContent = 'Đang đánh thức...';
      try {
        const summary = await fetchJson('/api/admin/import-jobs/wake', {
          method: 'POST',
          headers: adminHeaders()
        });
        renderCrawlQueueStatusTarget(target, summary);
      } catch (error) {
        target.className = 'status-line crawl-queue-status error';
        target.textContent = `Không đánh thức được crawler: ${error.message}`;
      } finally {
        wakeButton.disabled = false;
        wakeButton.textContent = 'Đánh thức crawler';
      }
    });

    const refreshPromise = refresh();
    crawlQueuePollTimer = setIntervalFn(refresh, 3000);
    return refreshPromise;
  }

  return {
    bindCrawlQueueStatus,
    bindS3SyncStatus
  };
}
