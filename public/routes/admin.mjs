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
  clearAdminSession,
  loadAdminEmail,
  loadAdminToken
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
import { createAdminImportActions } from './adminImportActions.mjs';
import { createAdminSaveActions } from './adminSaveActions.mjs';
import { createAdminAuthActions } from './adminAuthActions.mjs';

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
  const adminImportActions = createAdminImportActions({
    adminHeaders,
    app,
    clearControlPending,
    fetchJson,
    invalidateContentCache,
    pollImportJob,
    renderAdmin,
    setAdminFlashMessage: (message) => {
      adminFlashMessage = message;
    },
    setControlPending,
    splitList
  });
  const handleImport = adminImportActions.handleImport;
  const adminSaveActions = createAdminSaveActions({
    adminHeaders,
    canRunLocalOperations,
    fetchJson,
    invalidateContentCache,
    renderAdmin,
    setControlPending,
    splitList
  });
  const handleAdminSave = adminSaveActions.handleAdminSave;
  const adminAuthActions = createAdminAuthActions({
    app,
    clearControlPending,
    fetchJson,
    route,
    setControlPending
  });
  const bindAdminCommonActions = adminAuthActions.bindAdminCommonActions;
  const bindAdminLoginForm = adminAuthActions.bindAdminLoginForm;

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

  function renderAdminLogin(message = '') {
    app.innerHTML = renderAdminLoginView({
      topbarHtml: renderTopbar(),
      email: loadAdminEmail(),
      message
    });
    bindAdminLoginForm();
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
  return {
    renderAdmin,
    renderAdminSeriesDetail
  };
}
