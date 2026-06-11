import { localOperationsEnabled } from '../runtimeConfig.mjs';
import { renderProductionProgressView } from './adminProductionView.mjs';
import {
  renderAdminSeriesCard as renderAdminSeriesCardView,
  renderAdminSeriesEditor as renderAdminSeriesEditorView
} from './adminSeriesEditorView.mjs';
import {
  renderAdminBulletinPanel,
  renderAdminSessionBar,
  renderCrawlQueuePanel,
  renderProductionAdminNotice,
  renderS3SyncPanel
} from './adminShellView.mjs';
import { renderRevenueDashboard } from './adminRevenueView.mjs';
import {
  renderAdminApiError as renderAdminApiErrorView,
  renderAdminLoginView,
  renderProductionCheckResult as renderProductionCheckResultView
} from './adminFeedbackView.mjs';
import {
  formatCrawlDuration,
  formatCrawlRate,
  renderCrawlQueueStatusView
} from './adminCrawlQueueView.mjs';
import { renderImportProgressView } from './adminImportProgressView.mjs';
import { renderS3SyncStatusView } from './adminS3SyncView.mjs';
import {
  buildAdminChapterPatch,
  buildAdminImportPayload,
  buildAdminSeriesPatch
} from './adminPayloads.mjs';
import {
  importJobsFlashMessage,
  importJobsFromResult,
  parseProductionSteps,
  resolveImportJobSeries
} from './adminJobHelpers.mjs';

const ADMIN_TOKEN_KEY = 'comic-admin-token';
const ADMIN_EMAIL_KEY = 'comic-admin-email';
const DEFAULT_ADMIN_EMAIL = '';
const adminSessionMemory = {
  token: '',
  email: ''
};

export function loadAdminToken() {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || adminSessionMemory.token || '';
  } catch {
    return adminSessionMemory.token || '';
  }
}

function loadAdminEmail() {
  try {
    return localStorage.getItem(ADMIN_EMAIL_KEY) || adminSessionMemory.email || DEFAULT_ADMIN_EMAIL;
  } catch {
    return adminSessionMemory.email || DEFAULT_ADMIN_EMAIL;
  }
}

function saveAdminSession(session) {
  adminSessionMemory.token = String(session?.token || '').trim();
  adminSessionMemory.email = String(session?.email || DEFAULT_ADMIN_EMAIL).trim();
  try {
    if (adminSessionMemory.token) localStorage.setItem(ADMIN_TOKEN_KEY, adminSessionMemory.token);
    if (adminSessionMemory.email) localStorage.setItem(ADMIN_EMAIL_KEY, adminSessionMemory.email);
  } catch {}
}

function clearAdminSession() {
  adminSessionMemory.token = '';
  adminSessionMemory.email = '';
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_EMAIL_KEY);
  } catch {}
}

export function createAdminRoute({
  adminHeaders,
  app,
  chapterHrefSegment,
  escapeAttr,
  escapeHtml,
  fetchJson,
  invalidateContentCache,
  loadCatalog,
  renderTopbar,
  route,
  clearControlPending,
  setControlPending,
  splitList,
  stopReaderRuntime
}) {
  let adminFlashMessage = '';
  let s3SyncPollTimer = null;
  let crawlQueuePollTimer = null;
  let adminProductionStatus = null;

  function canRunLocalOperations() {
    return localOperationsEnabled();
  }

  async function loadAdminCatalog() {
    return fetchJson('/api/admin/series', { headers: adminHeaders() });
  }

  async function loadAdminBulletin() {
    return fetchJson('/api/admin/bulletin/messages?limit=40', { headers: adminHeaders() })
      .catch(() => ({ messages: [] }));
  }

  async function loadAdminAnalytics(range = '30d') {
    return fetchJson(`/api/admin/analytics/summary?range=${encodeURIComponent(range)}`, { headers: adminHeaders() })
      .catch(() => null);
  }

  async function loadAdminProductionStatus() {
    return fetchJson('/api/admin/production-status', { headers: adminHeaders() })
      .catch(() => ({ statuses: {}, stateFileExists: false }));
  }

  async function renderAdmin() {
    stopReaderRuntime();
    if (!loadAdminToken()) {
      renderAdminLogin();
      return;
    }
    let catalog;
    let bulletin;
    let analytics;
    let productionStatus;
    try {
      [catalog, bulletin, analytics, productionStatus] = await Promise.all([
        loadAdminCatalog(),
        loadAdminBulletin(),
        loadAdminAnalytics(),
        loadAdminProductionStatus()
      ]);
      adminProductionStatus = productionStatus;
    } catch (error) {
      if (isAdminAuthError(error)) {
        clearAdminSession();
        renderAdminLogin('Phiên admin đã hết hạn, vui lòng đăng nhập lại.');
        return;
      }
      throw error;
    }
    const localOps = canRunLocalOperations();
    app.innerHTML = `
      <main class="site-shell admin-shell">
        ${renderTopbar()}
        ${renderAdminSessionBar(loadAdminEmail())}
        <section class="admin-grid">
          ${localOps ? `<form class="import-panel admin-panel" data-import-form>
            <h2>Crawl truyện</h2>
            <textarea name="url" required rows="4" placeholder="Dán mỗi URL truyện trên một dòng...">https://truyenqqko.com/truyen-tranh/manh-nhat-lich-su-5968</textarea>
            <select name="maxChapters" aria-label="Số chapter tải trước">
              <option value="1">1 chapter</option>
              <option value="2">2 chapter</option>
              <option value="3" selected>3 chapter</option>
              <option value="5">5 chapter</option>
              <option value="0">Tất cả chapter</option>
            </select>
            <select name="maxPages" aria-label="Số ảnh mỗi chapter">
              <option value="0" selected>Tất cả ảnh</option>
              <option value="8">8 ảnh/chapter</option>
              <option value="20">20 ảnh/chapter</option>
            </select>
            <select name="assetMode" aria-label="Chế độ lấy ảnh">
              <option value="image_url" selected>Chỉ lấy URL ảnh</option>
              <option value="full_download">Cào toàn bộ + tải ảnh</option>
            </select>
            <button class="primary-btn" type="submit">Crawl</button>
          </form>` : renderProductionAdminNotice()}
          ${localOps ? renderCrawlQueuePanel() : ''}
          ${renderAdminBulletinPanel(bulletin.messages || [])}
          ${localOps ? renderS3SyncPanel(adminProductionStatus) : ''}
          <div class="status-line" data-status></div>
        </section>
        ${renderRevenueDashboard(analytics)}
        ${adminFlashMessage ? `<div class="status-line success">${escapeHtml(adminFlashMessage)}</div>` : ''}
        <section class="admin-list">
          <div class="admin-list-head">
            <div>
              <h2 class="section-title">CMS truyện</h2>
              <p class="muted">Chọn một truyện để mở trang quản lý riêng. Danh sách này chỉ giữ thông tin nhận diện và thao tác nhanh.</p>
            </div>
          </div>
          ${catalog.series.length ? `<div class="admin-series-list-grid">${catalog.series.map(renderAdminSeriesCard).join('')}</div>` : '<div class="empty-state">Chưa có truyện để quản lý.</div>'}
        </section>
      </main>
    `;
    adminFlashMessage = '';
    bindAdminCommonActions();
    bindAdminImageFallbacks();
    bindRevenueDashboard();
    app.querySelector('[data-import-form]')?.addEventListener('submit', handleImport);
    bindAdminBulletinActions();
    if (localOps) {
      bindCrawlQueueStatus();
      bindS3SyncStatus();
    }
    bindProductionPipelineActions();
  }

  async function renderAdminSeriesDetail(seriesId) {
    stopReaderRuntime();
    if (!loadAdminToken()) {
      renderAdminLogin();
      return;
    }
    let catalog;
    let productionStatus;
    try {
      [catalog, productionStatus] = await Promise.all([
        loadAdminCatalog(),
        loadAdminProductionStatus()
      ]);
      adminProductionStatus = productionStatus;
    } catch (error) {
      if (isAdminAuthError(error)) {
        clearAdminSession();
        renderAdminLogin('Phiên admin đã hết hạn, vui lòng đăng nhập lại.');
        return;
      }
      throw error;
    }
    const series = findAdminSeries(catalog, seriesId);
    const localOps = canRunLocalOperations();
    app.innerHTML = `
      <main class="site-shell admin-shell admin-detail-shell">
        ${renderTopbar()}
        ${renderAdminSessionBar(loadAdminEmail())}
        <div class="admin-detail-nav">
          <a class="ghost-btn" data-link href="/admin">Quay lại CMS</a>
          ${series?.slug ? `<a class="ghost-btn" data-link href="/truyen/${escapeAttr(series.slug)}">Mở trang public</a>` : ''}
        </div>
        ${adminFlashMessage ? `<div class="status-line success">${escapeHtml(adminFlashMessage)}</div>` : ''}
        ${!localOps ? renderProductionAdminNotice() : ''}
        ${series ? renderAdminSeriesEditor(series, { localOps }) : '<section class="empty-state">Không tìm thấy truyện trong catalog admin.</section>'}
      </main>
    `;
    adminFlashMessage = '';
    bindAdminCommonActions();
    bindAdminImageFallbacks();
    app.querySelectorAll('[data-admin-series]').forEach((form) => form.addEventListener('submit', handleAdminSave));
    bindProductionPipelineActions();
  }

  function bindRevenueDashboard() {
    const dashboard = app.querySelector('[data-revenue-dashboard]');
    if (!dashboard) return;
    dashboard.querySelectorAll('[data-analytics-range]').forEach((button) => {
      button.addEventListener('click', async () => {
        const range = button.dataset.analyticsRange || '30d';
        button.disabled = true;
        try {
          const summary = await loadAdminAnalytics(range);
          dashboard.outerHTML = renderRevenueDashboard(summary);
          bindRevenueDashboard();
        } catch (error) {
          dashboard.insertAdjacentHTML('afterbegin', `<div class="status-line error">Không tải được analytics: ${escapeHtml(error.message)}</div>`);
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  function bindAdminBulletinActions() {
    app.querySelector('[data-admin-bulletin-form]')?.addEventListener('submit', handleAdminBulletinSubmit);
    app.querySelectorAll('[data-admin-bulletin-pin]').forEach((button) => button.addEventListener('click', handleAdminBulletinPin));
  }

  async function handleAdminBulletinSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = app.querySelector('[data-admin-bulletin-status]');
    const button = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    setControlPending(button);
    if (status) {
      status.className = 'status-line';
      status.textContent = 'Dang gui tin admin...';
    }
    try {
      await fetchJson('/api/admin/bulletin/messages', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          text: formData.get('text'),
          pinned: formData.get('pinned') === 'on'
        })
      });
      form.reset();
      adminFlashMessage = 'Da gui tin admin.';
      await renderAdmin();
    } catch (error) {
      if (status) {
        status.className = 'status-line error';
        status.textContent = error.message;
      }
    } finally {
      clearControlPending();
    }
  }

  async function handleAdminBulletinPin(event) {
    const button = event.currentTarget;
    const messageId = button.dataset.adminBulletinPin;
    const pinned = button.dataset.pinned !== 'true';
    const status = app.querySelector('[data-admin-bulletin-status]');
    button.disabled = true;
    try {
      await fetchJson(`/api/admin/bulletin/messages/${encodeURIComponent(messageId)}`, {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify({ pinned })
      });
      adminFlashMessage = pinned ? 'Da ghim tin admin.' : 'Da bo ghim tin admin.';
      await renderAdmin();
    } catch (error) {
      if (status) {
        status.className = 'status-line error';
        status.textContent = error.message;
      }
      button.disabled = false;
    }
  }

  function bindAdminCommonActions() {
    app.querySelector('[data-admin-logout]')?.addEventListener('click', () => {
      clearAdminSession();
      route();
    });
  }

  function bindS3SyncStatus() {
    const target = app.querySelector('[data-s3-sync-status]');
    if (!target) return;
    if (s3SyncPollTimer) clearInterval(s3SyncPollTimer);
    const refresh = async () => {
      if (!target.isConnected) {
        clearInterval(s3SyncPollTimer);
        s3SyncPollTimer = null;
        return;
      }
      try {
        const status = await fetchJson('/api/admin/s3-sync/status', { headers: adminHeaders() });
        renderS3SyncStatus(target, status);
        bindS3RetryFailed(target, refresh);
      } catch (error) {
        target.className = 'status-line s3-sync-status error';
        target.textContent = `Không đọc được tiến trình S3: ${error.message}`;
      }
    };
    refresh();
    s3SyncPollTimer = setInterval(refresh, 2500);
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
    if (!target) return;
    if (crawlQueuePollTimer) clearInterval(crawlQueuePollTimer);

    const refresh = async () => {
      if (!target.isConnected) {
        clearInterval(crawlQueuePollTimer);
        crawlQueuePollTimer = null;
        return;
      }
      try {
        const summary = await fetchJson('/api/admin/import-jobs/summary', { headers: adminHeaders() });
        renderCrawlQueueStatus(target, summary);
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
        renderCrawlQueueStatus(target, summary);
      } catch (error) {
        target.className = 'status-line crawl-queue-status error';
        target.textContent = `Không đánh thức được crawler: ${error.message}`;
      } finally {
        wakeButton.disabled = false;
        wakeButton.textContent = 'Đánh thức crawler';
      }
    });

    refresh();
    crawlQueuePollTimer = setInterval(refresh, 3000);
  }

  function renderCrawlQueueStatus(target, summary = {}) {
    const view = renderCrawlQueueStatusView(summary);
    target.className = view.className;
    target.innerHTML = view.html;
  }

  function renderS3SyncStatus(target, status = {}) {
    const view = renderS3SyncStatusView(status);
    target.className = view.className;
    target.innerHTML = view.html;
  }

  function bindAdminImageFallbacks() {
    app.querySelectorAll('[data-admin-cover-img]').forEach((image) => {
      image.addEventListener('error', handleAdminCoverError, { once: false });
    });
  }

  function handleAdminCoverError(event) {
    const image = event.currentTarget;
    const fallbackSrc = image.dataset.fallbackSrc || '';
    if (fallbackSrc && image.getAttribute('src') !== fallbackSrc) {
      image.removeAttribute('data-fallback-src');
      image.src = fallbackSrc;
      return;
    }
    image.closest('.admin-series-cover')?.classList.add('is-missing');
    image.remove();
  }
  function findAdminSeries(catalog, seriesId) {
    const id = String(seriesId || '');
    return (catalog.series || []).find((series) => series.id === id || series.slug === id) || null;
  }

  function renderAdminLogin(message = '') {
    app.innerHTML = renderAdminLoginView({
      topbarHtml: renderTopbar(),
      email: loadAdminEmail(),
      message
    });
    app.querySelector('[data-admin-login-form]').addEventListener('submit', handleAdminLogin);
  }

  function isAdminAuthError(error) {
    return /admin token is required|unauthorized|401/i.test(error?.message || '');
  }

  function renderAdminSeriesCard(series) {
    return renderAdminSeriesCardView(series, {
      localOps: canRunLocalOperations(),
      productionStatus: adminProductionStatus
    });
  }

  function renderAdminSeriesEditor(series, { localOps = canRunLocalOperations() } = {}) {
    return renderAdminSeriesEditorView(series, {
      chapterHrefSegment,
      localOps,
      productionStatus: adminProductionStatus
    });
  }
  async function handleImport(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = app.querySelector('[data-status]');
    const button = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const payload = buildAdminImportPayload(formData, { splitList });
    const urls = payload.urls;
    if (!urls.length) {
      if (status) {
        status.className = 'status-line error';
        status.textContent = 'Vui long nhap URL truyen hop le.';
      }
      return;
    }

    setControlPending(button);
    if (status) {
      status.className = 'status-line';
      status.textContent = urls.length > 1 ? `Dang tao ${urls.length} job crawl...` : 'Dang tao job crawl...';
    }

    try {
      const result = await fetchJson('/api/admin/import-jobs', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify(payload)
      });
      const jobs = importJobsFromResult(result);
      if (!jobs.length) throw new Error('Khong tao duoc job crawl.');
      if (jobs.length === 1) {
        const series = await pollImportJob(jobs[0].job.id, status, { navigateOnComplete: false });
        adminFlashMessage = importJobsFlashMessage(jobs, series);
      } else {
        if (status) status.textContent = `Đã tạo ${jobs.length} job crawl. Theo dõi trong bảng Trạng thái crawl.`;
        adminFlashMessage = `Đã tạo ${jobs.length} job crawl.`;
      }
      invalidateContentCache();
      await renderAdmin();
    } catch (error) {
      if (status) {
        status.className = 'status-line error';
        status.textContent = error.message;
      }
    } finally {
      clearControlPending();
    }
  }
  async function handleAdminSave(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const seriesId = form.dataset.adminSeries;
    const patch = buildAdminSeriesPatch(formData, {
      splitList,
      localOps: canRunLocalOperations()
    });

    setControlPending(form.querySelector('button[type="submit"]'));
    await fetchJson(`/api/admin/series/${encodeURIComponent(seriesId)}`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify(patch)
    });

    for (const row of form.querySelectorAll('[data-admin-chapter]')) {
      const chapterId = row.dataset.adminChapter;
      await fetchJson(`/api/admin/series/${encodeURIComponent(seriesId)}/chapters/${encodeURIComponent(chapterId)}`, {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify(buildAdminChapterPatch(formData, chapterId))
      });
    }

    invalidateContentCache();
    await renderAdmin();
  }

  async function handleAdminLogin(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const status = app.querySelector('[data-status]');
    const formData = new FormData(form);
    setControlPending(button);
    if (status) {
      status.className = 'status-line';
      status.textContent = 'Đang đăng nhập...';
    }
  
    try {
      const session = await fetchJson('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: formData.get('email'),
          password: formData.get('password')
        })
      });
      saveAdminSession(session);
      await route();
    } catch (error) {
      if (status) {
        status.className = 'status-line error';
        status.textContent = error.message;
      }
    } finally {
      clearControlPending();
    }
  }

  async function handleUpdateChapters(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const seriesId = button.dataset.updateChapters;
    const status = app.querySelector(`[data-update-chapters-status="${CSS.escape(seriesId)}"]`);
    button.disabled = true;
    button.textContent = 'Đang cập nhật...';
    if (status) {
      status.className = 'status-line admin-wide admin-update-status';
      status.textContent = 'Đang tạo job cập nhật chapter mới...';
    }

    try {
      const result = await fetchJson(`/api/admin/series/${encodeURIComponent(seriesId)}/update-chapters`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({})
      });
      if (result.reused && status) status.textContent = 'Truyện này đang có job crawl, đang theo dõi job hiện tại...';
      const series = await pollImportJob(result.job.id, status, { navigateOnComplete: false });
      const summary = series.importSummary || {};
      const count = Number(summary.newChapterCount || 0);
      adminFlashMessage = count > 0
        ? `Đã thêm ${count} chapter mới cho ${series.title}.`
        : `Chưa có chapter mới cho ${series.title}.`;
      invalidateContentCache();
      await renderAdmin();
    } catch (error) {
      if (status) {
        status.className = 'status-line admin-wide admin-update-status error';
        status.textContent = error.message;
      }
      button.disabled = false;
      button.textContent = 'Cập nhật chapter mới';
    }
  }

  async function handleRefreshImageUrls(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const seriesId = button.dataset.refreshImageUrls;
    const status = app.querySelector(`[data-update-chapters-status="${CSS.escape(seriesId)}"]`);
    button.disabled = true;
    button.textContent = 'Đang refresh...';
    if (status) {
      status.className = 'status-line admin-wide admin-update-status';
      status.textContent = 'Đang tạo job refresh URL ảnh...';
    }

    try {
      const result = await fetchJson(`/api/admin/series/${encodeURIComponent(seriesId)}/refresh-image-urls`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({})
      });
      if (result.reused && status) status.textContent = 'Truyện này đang có job crawl, đang theo dõi job hiện tại...';
      const series = await pollImportJob(result.job.id, status, { navigateOnComplete: false });
      const summary = series.importSummary || {};
      const refreshed = Number(summary.refreshedExistingChapterCount || 0);
      const added = Number(summary.newChapterCount || 0);
      adminFlashMessage = `Đã refresh URL ảnh cho ${refreshed} chapter${added ? ` và thêm ${added} chapter mới` : ''}. Hãy kiểm tra reader local rồi bấm Sync DB để cập nhật production.`;
      invalidateContentCache();
      await renderAdminSeriesDetail(series.id || seriesId);
    } catch (error) {
      if (status) {
        status.className = 'status-line admin-wide admin-update-status error';
        status.textContent = error.message;
      }
      button.disabled = false;
      button.textContent = 'Refresh URL ảnh';
    }
  }

  function bindProductionPipelineActions() {
    app.querySelectorAll('[data-update-chapters]').forEach((button) => button.addEventListener('click', handleUpdateChapters));
    app.querySelectorAll('[data-refresh-image-urls]').forEach((button) => button.addEventListener('click', handleRefreshImageUrls));
    app.querySelectorAll('[data-publish-production]').forEach((button) => button.addEventListener('click', handleProductionPublish));
    app.querySelectorAll('[data-production-step]').forEach((button) => button.addEventListener('click', handleProductionStep));
    app.querySelectorAll('[data-production-check]').forEach((button) => button.addEventListener('click', handleProductionCheck));
  }

  async function handleProductionPublish(event) {
    await runProductionPipelineJob(event.currentTarget, {
      seriesId: event.currentTarget.dataset.publishProduction,
      steps: []
    });
  }

  async function handleProductionStep(event) {
    const button = event.currentTarget;
    const steps = parseProductionSteps(button.dataset.steps);
    await runProductionPipelineJob(button, {
      seriesId: button.dataset.productionStep,
      steps
    });
  }

  async function runProductionPipelineJob(button, { seriesId, steps = [] } = {}) {
    const status = app.querySelector(`[data-production-publish-status="${CSS.escape(seriesId)}"]`);
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = steps.length ? 'Dang chay buoc...' : 'Dang chay pipeline...';
    try {
      if (status) {
        status.className = 'status-line admin-wide production-publish-status';
        status.textContent = steps.length ? 'Dang tao job cho buoc da chon...' : 'Dang tao workflow production...';
      }
      const result = await fetchJson(`/api/admin/series/${encodeURIComponent(seriesId)}/publish-production`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ steps })
      });
      if (result.reused && status) {
        status.textContent = 'Dang dung lai job production dang chay cho buoc nay...';
      }
      const job = await pollProductionJob(result.job.id, status);
      if (status) renderProductionProgress(status, job);
      if (job.status === 'completed') button.textContent = steps.length ? 'Chay lai buoc nay' : 'Sync lai production';
    } catch (error) {
      if (status) {
        status.className = 'status-line admin-wide production-publish-status error';
        status.innerHTML = renderAdminApiErrorView(error, 'Khong chay duoc production pipeline.');
      }
      button.textContent = originalText;
    } finally {
      button.disabled = false;
    }
  }

  async function handleProductionCheck(event) {
    const button = event.currentTarget;
    const seriesId = button.dataset.productionCheck;
    const url = button.dataset.productionUrl || '';
    const status = app.querySelector(`[data-production-publish-status="${CSS.escape(seriesId)}"]`);
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Dang check...';
    try {
      if (!url) throw new Error('Truyen chua co production URL de kiem tra.');
      if (status) {
        status.className = 'status-line admin-wide production-publish-status';
        status.textContent = 'Dang kiem tra production URL...';
      }
      const result = await fetchJson('/api/admin/production-check', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ url, seriesId })
      });
      if (!result.ok) throw new Error(result.error || `Production tra ve HTTP ${result.status || '?'}.`);
      if (status) {
        status.className = 'status-line admin-wide production-publish-status success';
        status.innerHTML = renderProductionCheckResultView(result, url);
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      if (status) {
        status.className = 'status-line admin-wide production-publish-status error';
        status.innerHTML = renderAdminApiErrorView(error, 'Check production loi.');
      }
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  async function pollImportJob(jobId, status, { navigateOnComplete = false } = {}) {
    while (true) {
      const job = await fetchJson(`/api/admin/import-jobs/${encodeURIComponent(jobId)}`, {
        headers: adminHeaders()
      });
      renderImportProgress(status, job);
      if (job.status === 'completed') {
        const series = resolveImportJobSeries(job);
        if (navigateOnComplete && series?.id) {
          window.location.href = `/admin/series/${encodeURIComponent(series.id)}`;
        }
        return series;
      }
      if (job.status === 'failed') {
        throw new Error(job.error || job.lastError || 'Import job failed.');
      }
      await delay(1500);
    }
  }

  async function pollProductionJob(jobId, status) {
    while (true) {
      const job = await fetchJson(`/api/admin/production-jobs/${encodeURIComponent(jobId)}`, {
        headers: adminHeaders()
      });
      renderProductionProgress(status, job);
      if (job.status === 'completed') return job;
      if (job.status === 'failed') throw new Error(job.error || 'Production workflow thất bại.');
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  function renderProductionProgress(status, job) {
    if (!status) return;
    const view = renderProductionProgressView(job);
    status.className = view.className;
    status.innerHTML = view.html;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
  }

  function renderImportProgress(status, job) {
    if (!status) return;
    const isAdminUpdateStatus = Boolean(status.hasAttribute && status.hasAttribute('data-update-chapters-status'));
    const view = renderImportProgressView(job, { isAdminUpdateStatus });
    status.className = view.className;
    status.innerHTML = view.html;
  }

  return {
    renderAdmin,
    renderAdminSeriesDetail
  };
}
