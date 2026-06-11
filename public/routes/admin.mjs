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
  renderAdminLoginView
} from './adminFeedbackView.mjs';
import {
  buildAdminChapterPatch,
  buildAdminImportPayload,
  buildAdminSeriesPatch
} from './adminPayloads.mjs';
import {
  importJobsFlashMessage,
  importJobsFromResult
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
import { createAdminSeriesJobActions } from './adminSeriesJobActions.mjs';
import { createAdminProductionActions } from './adminProductionActions.mjs';
import { createAdminBulletinActions } from './adminBulletinActions.mjs';
import { createAdminRevenueActions } from './adminRevenueActions.mjs';

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
  const adminSeriesJobActions = createAdminSeriesJobActions({
    adminHeaders,
    app,
    cssEscape: (value) => CSS.escape(value),
    fetchJson,
    invalidateContentCache,
    pollImportJob,
    renderAdmin,
    renderAdminSeriesDetail,
    setAdminFlashMessage: (message) => {
      adminFlashMessage = message;
    }
  });
  const handleRefreshImageUrls = adminSeriesJobActions.handleRefreshImageUrls;
  const handleUpdateChapters = adminSeriesJobActions.handleUpdateChapters;
  const adminProductionActions = createAdminProductionActions({
    adminHeaders,
    app,
    cssEscape: (value) => CSS.escape(value),
    fetchJson,
    pollProductionJob,
    renderProductionProgressStatus
  });
  const bindProductionPipelineActions = () => adminProductionActions.bindProductionPipelineActions({
    handleRefreshImageUrls,
    handleUpdateChapters
  });
  const adminBulletinActions = createAdminBulletinActions({
    adminHeaders,
    app,
    clearControlPending,
    fetchJson,
    renderAdmin,
    setAdminFlashMessage: (message) => {
      adminFlashMessage = message;
    },
    setControlPending
  });
  const bindAdminBulletinActions = adminBulletinActions.bindAdminBulletinActions;
  const adminRevenueActions = createAdminRevenueActions({
    app,
    escapeHtml,
    loadAdminAnalytics,
    renderRevenueDashboard
  });
  const bindRevenueDashboard = adminRevenueActions.bindRevenueDashboard;

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

  return {
    renderAdmin,
    renderAdminSeriesDetail
  };
}
