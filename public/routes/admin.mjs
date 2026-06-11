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
  renderAdminDashboardPage,
  renderAdminSeriesDetailPage
} from './adminPageViews.mjs';
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
    app.innerHTML = renderAdminDashboardPage({
      topbarHtml: renderTopbar(),
      sessionBarHtml: renderAdminSessionBar(loadAdminEmail()),
      localOps,
      productionNoticeHtml: renderProductionAdminNotice(),
      crawlQueuePanelHtml: renderCrawlQueuePanel(),
      bulletinPanelHtml: renderAdminBulletinPanel(bulletin.messages || []),
      s3SyncPanelHtml: renderS3SyncPanel(adminProductionStatus),
      revenueDashboardHtml: renderRevenueDashboard(analytics),
      flashMessage: adminFlashMessage,
      series: catalog.series,
      renderSeriesCard: renderAdminSeriesCard,
      escapeHtml
    });
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
    app.innerHTML = renderAdminSeriesDetailPage({
      topbarHtml: renderTopbar(),
      sessionBarHtml: renderAdminSessionBar(loadAdminEmail()),
      localOps,
      productionNoticeHtml: renderProductionAdminNotice(),
      flashMessage: adminFlashMessage,
      series,
      editorHtml: series ? renderAdminSeriesEditor(series, { localOps }) : '',
      escapeHtml,
      escapeAttr
    });
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
