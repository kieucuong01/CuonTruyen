import { localOperationsEnabled } from '../runtimeConfig.mjs';
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
  buildAdminChapterPatch,
  buildAdminImportPayload,
  buildAdminSeriesPatch
} from './adminPayloads.mjs';
import {
  importJobsFlashMessage,
  importJobsFromResult,
  parseProductionSteps
} from './adminJobHelpers.mjs';
import {
  clearAdminSession,
  loadAdminEmail,
  loadAdminToken,
  saveAdminSession
} from './adminSession.mjs';
import {
  createAdminJobPollers,
  renderProductionProgressStatus
} from './adminJobPolling.mjs';
import { createAdminDataLoaders } from './adminDataLoaders.mjs';
import {
  bindAdminImageFallbacks,
  findAdminSeries,
  isAdminAuthError
} from './adminDomHelpers.mjs';
import { createAdminPanelPollers } from './adminPanelPolling.mjs';

export { loadAdminToken };

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
  let adminProductionStatus = null;
  const adminJobPollers = createAdminJobPollers({
    adminHeaders,
    fetchJson,
    navigateTo: (url) => {
      window.location.href = url;
    }
  });
  const pollImportJob = adminJobPollers.pollImportJob;
  const pollProductionJob = adminJobPollers.pollProductionJob;
  const adminDataLoaders = createAdminDataLoaders({ adminHeaders, fetchJson });
  const loadAdminAnalytics = adminDataLoaders.loadAdminAnalytics;
  const loadAdminBulletin = adminDataLoaders.loadAdminBulletin;
  const loadAdminCatalog = adminDataLoaders.loadAdminCatalog;
  const loadAdminProductionStatus = adminDataLoaders.loadAdminProductionStatus;
  const adminPanelPollers = createAdminPanelPollers({
    adminHeaders,
    app,
    escapeHtml,
    fetchJson
  });
  const bindCrawlQueueStatus = adminPanelPollers.bindCrawlQueueStatus;
  const bindS3SyncStatus = adminPanelPollers.bindS3SyncStatus;

  function canRunLocalOperations() {
    return localOperationsEnabled();
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
    bindAdminImageFallbacks(app);
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
    bindAdminImageFallbacks(app);
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

  function renderAdminLogin(message = '') {
    app.innerHTML = renderAdminLoginView({
      topbarHtml: renderTopbar(),
      email: loadAdminEmail(),
      message
    });
    app.querySelector('[data-admin-login-form]').addEventListener('submit', handleAdminLogin);
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
      if (status) renderProductionProgressStatus(status, job);
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

  return {
    renderAdmin,
    renderAdminSeriesDetail
  };
}
