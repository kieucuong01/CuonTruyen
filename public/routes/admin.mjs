import { hasReadableChapter } from '../chapterState.mjs';
import { localOperationsEnabled } from '../runtimeConfig.mjs';
import {
  renderAdminProductionBadge as renderProductionBadgeView,
  renderProductionPipelineStep,
  renderProductionProgressView
} from './adminProductionView.mjs';
import {
  adminSeriesStats,
  renderAdminSeriesBadges,
  renderAssetModeBadge,
  seriesUsesExternalImageUrls,
  sourceUrlForAdminSeries,
  statusLabel
} from './adminSeriesView.mjs';
import {
  renderAdminBulletinPanel,
  renderAdminSessionBar,
  renderCrawlQueuePanel,
  renderProductionAdminNotice,
  renderS3SyncPanel
} from './adminShellView.mjs';
import { renderRevenueDashboard } from './adminRevenueView.mjs';
import {
  formatCrawlDuration,
  formatCrawlRate,
  renderCrawlQueueStatusView
} from './adminCrawlQueueView.mjs';
import { renderImportProgressView } from './adminImportProgressView.mjs';
import {
  getManualTagNames,
  mergeTagsWithOrigin,
  renderOriginTagPicker
} from './adminTags.mjs';
import { renderS3SyncStatusView } from './adminS3SyncView.mjs';

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
    app.innerHTML = `
      <main class="site-shell admin-shell">
        ${renderTopbar()}
        <section class="admin-login-card">
          <form class="import-panel admin-login-panel" data-admin-login-form>
            <h2>Đăng nhập admin</h2>
            <input name="email" type="email" required placeholder="Email admin" value="${escapeAttr(loadAdminEmail())}" autocomplete="username" />
            <input name="password" type="password" required placeholder="Mật khẩu" autocomplete="current-password" />
            <button class="primary-btn" type="submit">Đăng nhập</button>
          </form>
          <p class="status-line ${message ? 'error' : ''}" data-status>${escapeHtml(message)}</p>
        </section>
      </main>
    `;
    app.querySelector('[data-admin-login-form]').addEventListener('submit', handleAdminLogin);
  }

  function isAdminAuthError(error) {
    return /admin token is required|unauthorized|401/i.test(error?.message || '');
  }

  function renderAdminSeriesCard(series) {
    const sourceUrl = sourceUrlForAdminSeries(series);
    const stats = adminSeriesStats(series);
    const localOps = canRunLocalOperations();
    return `
      <article class="admin-series-card admin-series-list-card">
        <div class="admin-series-summary">
          ${renderAdminSeriesCover(series)}
          <div class="admin-series-summary-copy">
            <strong title="${escapeAttr(series.title)}">${escapeHtml(series.title)}</strong>
            <span>${stats.importedChapterCount}/${stats.chapterCount} chapter - ${stats.pageCount} ảnh</span>
            ${renderAdminSeriesBadges(stats)}
            ${renderAssetModeBadge(series)}
            ${renderAdminProductionBadge(series)}
          </div>
        </div>
        <div class="admin-series-card-actions">
          <a class="primary-btn" data-link href="/admin/series/${escapeAttr(series.id)}">Quản lý</a>
          ${localOps ? `<button class="ghost-btn" type="button" data-update-chapters="${escapeAttr(series.id)}" ${sourceUrl ? '' : 'disabled'}>Cập nhật chapter mới</button>` : ''}
          ${localOps && seriesUsesExternalImageUrls(series) ? `<button class="ghost-btn" type="button" data-refresh-image-urls="${escapeAttr(series.id)}" ${sourceUrl ? '' : 'disabled'}>Refresh URL ảnh</button>` : ''}
          ${localOps ? `<button class="ghost-btn production-quick-btn" type="button" data-publish-production="${escapeAttr(series.id)}" ${adminProductionStatus?.storage?.productionPostgres?.configured ? '' : 'disabled'}>Đưa lên production</button>` : ''}
          ${series.slug ? `<button class="ghost-btn" type="button" data-production-check="${escapeAttr(series.id)}" data-production-url="${escapeAttr(productionSeriesUrl(series))}">Check</button>` : ''}
          ${series.slug ? `<a class="ghost-btn" data-link href="/truyen/${escapeAttr(series.slug)}">Mở public</a>` : ''}
        </div>
        ${localOps ? `<div class="status-line admin-update-status" data-update-chapters-status="${escapeAttr(series.id)}"></div>` : ''}
        <div class="status-line production-publish-status" data-production-publish-status="${escapeAttr(series.id)}"></div>
      </article>
    `;
  }

  function renderAdminSeriesEditor(series, { localOps = canRunLocalOperations() } = {}) {
    const schedule = series.crawlSchedule || {};
    const sourceUrl = sourceUrlForAdminSeries(series);
    const chapters = Array.isArray(series.chapters) ? series.chapters : [];
    const stats = adminSeriesStats(series);
    return `
      <form class="admin-series-editor" data-admin-series="${escapeAttr(series.id)}">
        <section class="admin-detail-hero">
          ${renderAdminSeriesCover(series, { large: true })}
          <div class="admin-detail-title">
            <p class="eyebrow">Quản lý truyện</p>
            <h2>${escapeHtml(series.title)}</h2>
            <p>${stats.importedChapterCount}/${stats.chapterCount} chapter - ${stats.pageCount} ảnh - ${escapeHtml(statusLabel(stats.status))}</p>
            ${renderAdminSeriesBadges(stats)}
            ${renderAssetModeBadge(series)}
            ${renderAdminProductionBadge(series)}
          </div>
          ${localOps ? `<div class="admin-detail-actions">
            <button class="ghost-btn" type="button" data-update-chapters="${escapeAttr(series.id)}" ${sourceUrl ? '' : 'disabled'}>Cập nhật chapter mới</button>
            ${seriesUsesExternalImageUrls(series) ? `<button class="ghost-btn" type="button" data-refresh-image-urls="${escapeAttr(series.id)}" ${sourceUrl ? '' : 'disabled'}>Refresh URL ảnh</button>` : ''}
            <span class="muted">${sourceUrl ? 'Chỉ tải chapter chưa có, không tải lại ảnh cÅ©.' : 'Chưa có source URL để cập nhật.'}</span>
          </div>` : `<div class="admin-detail-actions"><span class="muted">Production admin chỉ quản lý nội dung; crawl và sync chạy ở local.</span></div>`}
        </section>
        ${localOps ? `<div class="status-line admin-wide admin-update-status" data-update-chapters-status="${escapeAttr(series.id)}"></div>` : ''}
        ${localOps ? renderProductionPublishPanel(series) : ''}
        <section class="admin-editor-section">
          <div class="section-head admin-editor-section-head">
            <div>
              <h2>Metadata</h2>
              <p>Cập nhật thông tin hiển thị public và SEO.</p>
            </div>
          </div>
          <div class="admin-series-details-grid">
            <label>Tiêu đề<input name="title" value="${escapeAttr(series.title)}" /></label>
            <label>Slug<input name="slug" value="${escapeAttr(series.slug || '')}" /></label>
            <label>Trạng thái${renderStatusSelect('status', stats.status)}</label>
            <label>Cover URL<input name="coverUrl" value="${escapeAttr(series.coverUrl || '')}" /></label>
            <label>Aliases<input name="aliases" value="${escapeAttr((series.aliases || []).join(', '))}" placeholder="Tên khác, cách nhau bởi dấu phẩy" /></label>
            <label>Tags<input name="tags" value="${escapeAttr(getManualTagNames(series).join(', '))}" placeholder="Action, Fantasy, School Life" /></label>
            ${renderOriginTagPicker(series)}
            <label class="admin-wide">Mô tả SEO<textarea name="description" aria-label="Mô tả" placeholder="Mô tả SEO">${escapeHtml(series.description || '')}</textarea></label>
            ${localOps ? `<label class="toggle-row"><input name="scheduleEnabled" type="checkbox" ${schedule.enabled ? 'checked' : ''} /> Auto crawl</label>` : ''}
            ${localOps ? `<label>Interval giờ<input name="intervalHours" type="number" min="1" value="${Number(schedule.intervalHours || 24)}" /></label>` : ''}
          </div>
        </section>
        <section class="admin-editor-section">
          <div class="admin-chapter-review admin-wide">
            <div class="admin-chapter-review-head">
              <strong>Duyệt chapter</strong>
              <span>Ẩn chapter lỗi hoặc chưa muốn public. Không xóa ảnh cache.</span>
            </div>
            ${chapters.length ? chapters.map((chapter) => renderAdminChapterRow(series, chapter)).join('') : '<p class="muted">Chưa có chapter.</p>'}
          </div>
        </section>
        <div class="admin-editor-savebar">
          <button class="primary-btn" type="submit">Lưu thay đổi</button>
        </div>
      </form>
    `;
  }

  function renderProductionPublishPanel(series) {
    const productionUrl = productionSeriesUrl(series);
    const sourceUrl = sourceUrlForAdminSeries(series);
    const urlOnlyAssets = seriesUsesExternalImageUrls(series);
    const productionDbConfigured = Boolean(adminProductionStatus?.storage?.productionPostgres?.configured);
    const productionDbWarning = productionDbConfigured ? '' : `
      <div class="status-line admin-wide production-publish-status error">
        Missing PRODUCTION_CATALOG_DATABASE_URL. Set production DB target to enable full publish and Sync DB.
      </div>
    `;
    const steps = [
      ...(urlOnlyAssets ? [{
        key: 'refresh-image-urls',
        label: 'Refresh URL ảnh',
        description: sourceUrl
          ? 'Crawl lại URL ảnh cho chapter hiện có, thêm chapter mới nếu nguồn có. Xong bước này cần Sync DB production.'
          : 'Cần source URL trước khi refresh URL ảnh.',
        button: 'Refresh URL ảnh',
        disabled: !sourceUrl,
        buttonAttr: `data-refresh-image-urls="${escapeAttr(series.id)}"`
      }] : []),
      {
        key: 'update-chapters',
        label: '1. Crawl chapter mới',
        description: sourceUrl ? 'Chỉ tải chapter chưa có, không tải lại ảnh cÅ©.' : 'Cần source URL trước khi cập nhật chapter.',
        button: 'Cập nhật chapter mới',
        disabled: !sourceUrl,
        buttonAttr: `data-update-chapters="${escapeAttr(series.id)}"`
      },
      {
        key: 'optimize',
        label: '2. Optimize ảnh',
        description: 'Tối ưu nhanh ảnh mới/chưa tối ưu. Không cleanup sâu mặc định.',
        button: 'Chạy optimize',
        steps: ['optimize']
      },
      {
        key: 'sync-images',
        label: '3. Sync ảnh S3',
        description: 'Chỉ sync ảnh của truyện đang chọn, có retry và resume checkpoint.',
        button: 'Sync S3',
        steps: ['sync-images']
      },
      {
        key: 'sync-catalog-db',
        label: '4. Sync catalog DB',
        description: 'Cap nhat metadata/chapter/page cua rieng truyen nay len production DB sau khi anh da len S3.',
        button: 'Sync DB',
        steps: ['sync-catalog-db'],
        disabled: !productionDbConfigured
      },
      {
        key: 'production-check',
        label: '5. Kiểm tra production',
        description: 'Mở/check URL production của truyện sau khi sync xong.',
        button: 'Check production',
        check: true,
        disabled: !productionUrl
      }
    ];
    return `
      <section class="admin-editor-section production-publish-panel">
        <div class="section-head admin-editor-section-head">
          <div>
            <p class="eyebrow">Production pipeline</p>
            <h2>Tối ưu ảnh và đưa truyện lên production</h2>
            <p>Chạy từng bước để dễ theo dõi và retry riêng khi kẹt. Nếu S3 lỗi thì chỉ bấm lại bước Sync S3, không cần chạy lại toàn bộ.</p>
          </div>
          <button class="primary-btn" type="button" data-publish-production="${escapeAttr(series.id)}" ${productionDbConfigured ? '' : 'disabled'}>Chạy nhanh: optimize + sync ảnh + sync DB</button>
        </div>
        ${productionDbWarning}
        <div class="production-pipeline-list" aria-label="Production pipeline steps">
          ${steps.map((step) => renderProductionPipelineStep(series, step, productionUrl)).join('')}
        </div>
        <div class="production-publish-note">
          <span>Khuyến nghị: crawl mới -> optimize -> sync ảnh S3 -> sync catalog DB -> check production.</span>
          ${productionUrl ? `<a href="${escapeAttr(productionUrl)}" target="_blank" rel="noopener noreferrer">Mở production</a>` : '<span>Truyện chưa có slug public để mở production.</span>'}
        </div>
        <div class="status-line admin-wide production-publish-status" data-production-publish-status="${escapeAttr(series.id)}"></div>
      </section>
    `;
  }

  function productionSeriesUrl(series) {
    if (!series?.slug) return '';
    const configuredBase = window.COMIC_READER_CONFIG?.productionBaseUrl || window.COMIC_READER_CONFIG?.publicSiteUrl || '';
    const base = String(configuredBase || 'https://cuontruyen.vercel.app').replace(/\/+$/, '');
    return `${base}/truyen/${encodeURIComponent(series.slug)}`;
  }

  function renderAdminSeriesCover(series, { large = false } = {}) {
    const coverUrl = series.thumbnailUrl || series.coverThumbnailUrl || series.coverUrl || series.imageUrl || '';
    const fallbackUrl = firstReadablePageImage(series);
    const initial = String(series.title || 'Truyện').trim().slice(0, 2).toUpperCase();
    return `
      <span class="admin-series-cover ${large ? 'is-large' : ''}" aria-hidden="true">
        <span class="admin-series-cover-fallback">${escapeHtml(initial || 'TR')}</span>
        ${coverUrl || fallbackUrl
          ? `<img data-admin-cover-img src="${escapeAttr(coverUrl || fallbackUrl)}" ${coverUrl && fallbackUrl && fallbackUrl !== coverUrl ? `data-fallback-src="${escapeAttr(fallbackUrl)}"` : ''} alt="" loading="lazy" />`
          : ''}
      </span>
    `;
  }

  function firstReadablePageImage(series = {}) {
    for (const chapter of series.chapters || []) {
      if (!hasReadableChapter(chapter)) continue;
      const page = (chapter.pages || []).find((item) => item?.imageUrl || item?.src || item?.storageKey);
      const src = page?.imageUrl || page?.src || page?.storageKey || '';
      if (src) return src;
    }
    return '';
  }

  function renderAdminProductionBadge(series = {}) {
    return renderProductionBadgeView(series, adminProductionStatus);
  }

  function renderStatusSelect(name, value) {
    const options = [
      ['public', 'Public'],
      ['draft', 'Draft'],
      ['removed', 'Removed']
    ];
    return `<select name="${name}">${options.map(([key, label]) => `<option value="${key}" ${value === key ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
  }

  function renderAdminChapterRow(series, chapter) {
    const readable = hasReadableChapter(chapter);
    const status = chapter.status || (readable ? 'public' : 'draft');
    const flags = [
      readable ? '' : 'thiếu ảnh',
      status === 'removed' ? 'đã ẩn' : '',
      status === 'draft' ? 'draft' : ''
    ].filter(Boolean);
    return `
      <div class="admin-chapter-row" data-admin-chapter="${escapeAttr(chapter.id)}">
        <div>
          <input name="chapterTitle:${escapeAttr(chapter.id)}" value="${escapeAttr(chapter.title || chapter.label || '')}" aria-label="Tên chapter" />
          <span>${chapter.pageCount || 0} ảnh${flags.length ? ` - ${escapeHtml(flags.join(' - '))}` : ''}</span>
        </div>
        ${renderStatusSelect(`chapterStatus:${escapeAttr(chapter.id)}`, status)}
        <input name="chapterReason:${escapeAttr(chapter.id)}" value="${escapeAttr(chapter.takedownReason || '')}" placeholder="Lý do ẩn" />
        <a class="ghost-btn" data-link href="/truyen/${series.slug}/${chapterHrefSegment(chapter)}">Mở</a>
      </div>
    `;
  }

  async function handleImport(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = app.querySelector('[data-status]');
    const button = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const urls = splitList(String(formData.get('url') || '').replace(/\r?\n/g, ','));
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
      const payload = {
        urls,
        maxChapters: Number(formData.get('maxChapters') || 0),
        maxPages: Number(formData.get('maxPages') || 0),
        assetMode: formData.get('assetMode') || 'image_url',
        publish: true
      };
      const result = await fetchJson('/api/admin/import-jobs', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify(payload)
      });
      const jobs = Array.isArray(result.jobs) ? result.jobs : result.job ? [{ job: result.job, reused: result.reused }] : [];
      if (!jobs.length) throw new Error('Khong tao duoc job crawl.');
      if (jobs.length === 1) {
        const series = await pollImportJob(jobs[0].job.id, status, { navigateOnComplete: false });
        adminFlashMessage = `Da crawl xong ${series.title || 'truyen'}.`;
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
    const patch = {
      title: formData.get('title'),
      slug: formData.get('slug'),
      coverUrl: formData.get('coverUrl'),
      aliases: splitList(formData.get('aliases')),
      tags: mergeTagsWithOrigin(splitList(formData.get('tags')), formData.get('originType')),
      description: formData.get('description'),
      status: formData.get('status')
    };
    if (canRunLocalOperations()) {
      patch.crawlSchedule = {
        enabled: formData.get('scheduleEnabled') === 'on',
        intervalHours: Number(formData.get('intervalHours') || 24)
      };
    }

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
        body: JSON.stringify({
          title: formData.get(`chapterTitle:${chapterId}`),
          label: formData.get(`chapterTitle:${chapterId}`),
          status: formData.get(`chapterStatus:${chapterId}`),
          takedownReason: formData.get(`chapterReason:${chapterId}`)
        })
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
    const steps = String(button.dataset.steps || '')
      .split(',')
      .map((step) => step.trim())
      .filter(Boolean);
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
        status.innerHTML = renderAdminApiError(error, 'Khong chay duoc production pipeline.');
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
        status.innerHTML = renderProductionCheckResult(result, url);
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      if (status) {
        status.className = 'status-line admin-wide production-publish-status error';
        status.innerHTML = renderAdminApiError(error, 'Check production loi.');
      }
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  function renderProductionCheckResult(result = {}, url = '') {
    const checks = Array.isArray(result.checks) ? result.checks : [];
    return `
      <div class="progress-copy">
        <strong>Production OK (${Number(result.status || 200)})</strong>
        <a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>
      </div>
      ${checks.length ? `<div class="production-step-list">
        ${checks.map((check) => `
          <article class="production-step is-${check.ok ? 'completed' : 'failed'}">
            <b>${check.ok ? '✓' : '!'} ${escapeHtml(check.label || check.key || 'Check')}</b>
            <span>${escapeHtml(check.url || '')}</span>
            <small>${check.ok ? `HTTP ${Number(check.status || 200)}` : escapeHtml(check.error || `HTTP ${Number(check.status || 0)}`)}</small>
          </article>
        `).join('')}
      </div>` : ''}
    `;
  }

  function renderAdminApiError(error, fallback = 'Request failed.') {
    const payload = error?.payload || {};
    const storage = payload.storage || {};
    const postgres = storage.postgres || {};
    const hints = Array.isArray(payload.hints) ? payload.hints : [];
    const storageLabel = storage.mode === 'postgres'
      ? `Postgres${postgres.host ? ` - ${postgres.host}${postgres.database ? `/${postgres.database}` : ''}` : ''}`
      : storage.mode ? storage.mode : '';

    return `
      <div class="progress-copy">
        <strong>${escapeHtml(payload.error || fallback)}</strong>
        ${error?.message && error.message !== payload.error ? `<span>${escapeHtml(error.message)}</span>` : ''}
        ${payload.cause ? `<small>${escapeHtml(payload.cause)}</small>` : ''}
        ${storageLabel ? `<small>Catalog storage: ${escapeHtml(storageLabel)}</small>` : ''}
        ${hints.length ? `<small>${hints.map((hint) => escapeHtml(hint)).join(' | ')}</small>` : ''}
      </div>
    `;
  }

  async function pollImportJob(jobId, status, { navigateOnComplete = false } = {}) {
    while (true) {
      const job = await fetchJson(`/api/admin/import-jobs/${encodeURIComponent(jobId)}`, {
        headers: adminHeaders()
      });
      renderImportProgress(status, job);
      if (job.status === 'completed') {
        const series = job.result?.series || job.series || job.result || {};
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
