import { hasReadableChapter } from '../chapterState.mjs';
import { localOperationsEnabled } from '../runtimeConfig.mjs';

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
        ${renderAdminSessionBar()}
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
            <button class="primary-btn" type="submit">Crawl</button>
          </form>` : renderProductionAdminNotice()}
          ${localOps ? renderCrawlQueuePanel() : ''}
          ${renderAdminBulletinPanel(bulletin.messages || [])}
          ${localOps ? renderS3SyncPanel() : ''}
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
        ${renderAdminSessionBar()}
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

  function formatNumber(value = 0) {
    return Number(value || 0).toLocaleString('vi-VN');
  }

  function formatPercent(value = 0) {
    return `${(Number(value || 0) * 100).toFixed(2)}%`;
  }

  function renderRevenueDashboard(summary) {
    if (!summary) {
      return `
        <section class="admin-panel revenue-dashboard">
          <div class="admin-list-head">
            <div>
              <h2 class="section-title">Doanh thu & tương tác</h2>
              <p class="muted">Chưa đọc được analytics. Dashboard sẽ tự hiện khi API sẵn sàng.</p>
            </div>
          </div>
        </section>
      `;
    }
    const totals = summary.totals || {};
    const rows = summary.topSeries || [];
    return `
      <section class="admin-panel revenue-dashboard" data-revenue-dashboard>
        <div class="admin-list-head">
          <div>
            <h2 class="section-title">Doanh thu & tương tác</h2>
            <p class="muted">Theo dõi view, impression quảng cáo, CTR nội bộ và donate click theo truyện.</p>
          </div>
          <div class="revenue-range-tabs" role="group" aria-label="Khoảng thời gian analytics">
            ${['7d', '30d', 'all'].map((range) => `
              <button class="ghost-btn ${summary.range === range ? 'active' : ''}" type="button" data-analytics-range="${range}">
                ${range === 'all' ? 'Tất cả' : range.replace('d', ' ngày')}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="revenue-metrics">
          <article><span>Views</span><strong>${formatNumber(totals.views)}</strong></article>
          <article><span>Ad impressions</span><strong>${formatNumber(totals.adImpressions)}</strong></article>
          <article><span>CTR quảng cáo</span><strong>${formatPercent(totals.adCtr)}</strong></article>
          <article><span>Donate clicks</span><strong>${formatNumber(totals.donateClicks)}</strong></article>
        </div>
        <div class="revenue-table-wrap">
          <table class="revenue-table">
            <thead>
              <tr>
                <th>Truyện</th>
                <th>Views</th>
                <th>Ad impressions</th>
                <th>CTR</th>
                <th>Donate</th>
                <th>Read depth</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map((row) => `
                <tr>
                  <td><a data-link href="/admin/series/${encodeURIComponent(row.seriesId || row.seriesSlug)}">${escapeHtml(row.title)}</a></td>
                  <td>${formatNumber(row.views)}</td>
                  <td>${formatNumber(row.adImpressions)}</td>
                  <td>${formatPercent(row.adCtr)}</td>
                  <td>${formatNumber(row.donateClicks)}</td>
                  <td>${formatNumber(row.readDepth)}%</td>
                </tr>
              `).join('') : '<tr><td colspan="6">Chưa có dữ liệu tracking trong khoảng này.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    `;
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

  function renderAdminSessionBar() {
    return `
      <section class="admin-session-bar">
        <strong>${escapeHtml(loadAdminEmail())}</strong>
        <button class="ghost-btn" type="button" data-admin-logout>Đăng xuất</button>
      </section>
    `;
  }

  function renderAdminBulletinPanel(messages = []) {
    return `
      <section class="admin-bulletin-panel">
        <div class="admin-bulletin-head">
          <div>
            <h2>Bảng tin Cuốn Truyện</h2>
            <p class="muted">Gửi tin admin và ghim thông báo lên đầu bảng chat public.</p>
          </div>
        </div>
        <form class="admin-bulletin-form" data-admin-bulletin-form>
          <textarea name="text" maxlength="500" rows="3" placeholder="Nhập thông báo hoặc tin nhắn admin..." required></textarea>
          <label class="toggle-row"><input name="pinned" type="checkbox" /> Ghim tin này</label>
          <button class="primary-btn" type="submit">Gửi tin</button>
        </form>
        <div class="status-line" data-admin-bulletin-status></div>
        <div class="admin-bulletin-list">
          ${messages.length ? messages.map(renderAdminBulletinMessage).join('') : '<p class="muted">Chưa có tin nhắn bảng tin.</p>'}
        </div>
      </section>
    `;
  }

  function renderProductionAdminNotice() {
    return `
      <section class="admin-panel production-admin-notice">
        <div class="admin-bulletin-head">
          <div>
            <h2>Production admin</h2>
            <p class="muted">Chế độ production chỉ dùng để quản lý nội dung: sửa metadata, duyệt chapter, public/draft/removed và xem dữ liệu. Crawl, optimize ảnh, sync S3 và production pipeline chỉ mở ở local.</p>
          </div>
        </div>
      </section>
    `;
  }

  function renderS3SyncPanel() {
    return `
      <section class="admin-panel s3-sync-panel">
        <div class="admin-bulletin-head">
          <div>
            <h2>Đồng bộ ảnh S3</h2>
            <p class="muted">Theo dõi tiến trình upload ảnh lên Vietnix S3 từ máy local.</p>
          </div>
        </div>
        <div class="status-line s3-sync-status" data-s3-sync-status>Đang kiểm tra tiến trình S3...</div>
      </section>
    `;
  }

  function renderCrawlQueuePanel() {
    return `
      <section class="admin-panel crawl-queue-panel">
        <div class="admin-bulletin-head">
          <div>
            <h2>Trạng thái crawl</h2>
            <p class="muted">Server local sẽ tự đánh thức crawler khi còn job đang chờ. Bảng này giúp biết crawl đang chạy, đang chờ hay đang lỗi.</p>
          </div>
          <button class="ghost-btn" type="button" data-crawl-queue-wake>Đánh thức crawler</button>
        </div>
        <div class="status-line crawl-queue-status" data-crawl-queue-status>Đang kiểm tra queue crawl...</div>
      </section>
    `;
  }

  function renderAdminBulletinMessage(message = {}) {
    const isAdmin = message.authorRole === 'admin';
    return `
      <article class="${message.pinned ? 'is-pinned' : ''}">
        <div>
          <strong>${escapeHtml(message.authorName || 'Reader')}</strong>
          ${message.pinned ? '<mark>GHIM</mark>' : isAdmin ? '<mark>ADMIN</mark>' : ''}
          <small>${escapeHtml(formatAdminBulletinTime(message.createdAt))}</small>
          <p>${escapeHtml(message.text || '')}</p>
        </div>
        ${isAdmin ? `<button class="ghost-btn" type="button" data-admin-bulletin-pin="${escapeAttr(message.id)}" data-pinned="${message.pinned ? 'true' : 'false'}">${message.pinned ? 'Bỏ ghim' : 'Ghim'}</button>` : '<span class="muted">User</span>'}
      </article>
    `;
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
    const counts = summary.counts || {};
    const runningJob = Array.isArray(summary.running) ? summary.running[0] : null;
    const queuedJobs = Array.isArray(summary.queued) ? summary.queued : [];
    const retryingJobs = Array.isArray(summary.retrying) ? summary.retrying : [];
    const failedJobs = Array.isArray(summary.failed) ? summary.failed : [];
    const totalWaiting = Number(counts.queued || 0) + Number(counts.retrying || 0);
    const worker = summary.worker || {};
    const workerText = worker.embeddedEnabled
      ? worker.active ? 'Crawler local đang xử lý queue.' : 'Crawler local sẵn sàng tự chạy khi có job chờ.'
      : 'Crawler embedded đang tắt; cần chạy worker riêng.';

    target.className = `status-line crawl-queue-status${failedJobs.length ? ' warning' : ''}`;
    const failedItems = Array.isArray(status.failedItems) ? status.failedItems : [];
    target.innerHTML = `
      <div class="progress-copy">
        <strong>${runningJob ? escapeHtml(runningJob.progress?.message || 'Đang crawl...') : totalWaiting ? 'Có job đang chờ crawler nhận' : 'Queue crawl đang rảnh'}</strong>
        <span>${escapeHtml(workerText)}</span>
      </div>
      <div class="progress-grid">
        <span>Đang chạy: ${Number(counts.running || 0)}</span>
        <span>Đang chờ: ${Number(counts.queued || 0)}</span>
        <span>Retry: ${Number(counts.retrying || 0)}</span>
        <span>Lỗi: ${Number(counts.failed || 0)}</span>
      </div>
      ${summary.staleResetCount ? `<p class="muted">Đã tự mở khóa ${Number(summary.staleResetCount)} job bị kẹt.</p>` : ''}
      ${runningJob ? renderCrawlQueueRunningJob(runningJob) : ''}
      ${queuedJobs.length ? renderCrawlQueueWaitingList('Job chờ tiếp theo', queuedJobs) : ''}
      ${retryingJobs.length ? renderCrawlQueueWaitingList('Job sẽ retry', retryingJobs) : ''}
      ${failedJobs.length ? renderCrawlQueueWaitingList('Job lỗi gần nhất', failedJobs) : ''}
    `;
  }

  function renderCrawlQueueRunningJob(job = {}) {
    const progress = job.progress || {};
    const chapterTotal = Number(progress.totalChapters || 0);
    const chapterDone = Number(progress.processedChapters || 0);
    const imageTotal = Number(progress.totalImages || 0);
    const imageDone = Number(progress.processedImages || progress.downloadedImages || 0);
    const imagePercent = imageTotal ? Math.min(100, Math.round((imageDone / imageTotal) * 100)) : 0;
    const eta = progress.etaSeconds != null ? formatCrawlDuration(progress.etaSeconds) : 'đang tính';
    return `
      <div class="crawl-queue-current">
        <div class="crawl-meter" aria-label="Tiến trình crawl">
          <span style="width:${imagePercent}%"></span>
        </div>
        <div class="progress-grid">
          <span>Chapter: ${chapterDone}/${chapterTotal || '?'}</span>
          <span>Ảnh: ${imageDone}/${imageTotal || '?'}</span>
          <span>Tốc độ: ${formatCrawlRate(progress.imagesPerMinute, 'ảnh/phút')}</span>
          <span>ETA: ${eta}</span>
        </div>
        <p class="muted">${escapeHtml(job.payload?.url || '')}</p>
      </div>
    `;
  }

  function renderCrawlQueueWaitingList(title, jobs = []) {
    return `
      <div class="crawl-queue-list">
        <strong>${escapeHtml(title)}</strong>
        ${jobs.slice(0, 4).map((job) => `
          <p>
            <span>${escapeHtml(job.payload?.mode || 'full')}</span>
            <span>${escapeHtml(job.payload?.url || job.payload?.seriesId || job.id || '')}</span>
            ${job.error ? `<small>${escapeHtml(job.error)}</small>` : ''}
          </p>
        `).join('')}
      </div>
    `;
  }

  function renderS3SyncStatus(target, status = {}) {
    const total = Number(status.total || 0);
    const checked = Number(status.checked || 0);
    const percent = total ? Math.max(0, Math.min(100, Number(status.percent || ((checked / total) * 100)))) : 0;
    const updatedAtMs = Date.parse(status.updatedAt || '');
    const statusAgeSeconds = Number.isFinite(updatedAtMs) ? Math.max(0, Math.round((Date.now() - updatedAtMs) / 1000)) : null;
    const staleRunning = status.status === 'running' && statusAgeSeconds != null && statusAgeSeconds > 90;
    const statusClass = status.status === 'failed'
      ? ' error'
      : status.status === 'completed'
        ? ' success'
        : staleRunning
          ? ' warning'
          : '';
    const title = status.message || (status.status === 'running' ? 'Đang đồng bộ ảnh lên S3...' : status.exists ? 'Tiến trình S3 gần nhất' : 'Chưa có tiến trình S3');
    target.className = `status-line s3-sync-status${statusClass}`;
    target.innerHTML = `
      <div class="progress-copy">
        <strong>${escapeHtml(title)}</strong>
        <span>${total ? `${percent.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% - ${checked.toLocaleString('vi-VN')}/${total.toLocaleString('vi-VN')} file` : 'Chưa có job sync đang ghi trạng thái.'}</span>
      </div>
      ${staleRunning ? '<p class="muted">Status S3 sync da hon 90 giay chua cap nhat. Job co the dang ket request S3; nen dung/retry thay vi doi vo han.</p>' : ''}
      <div class="crawl-meter" aria-label="Tiến độ đồng bộ S3">
        <div style="width:${Math.max(total ? 4 : 0, Math.min(100, percent))}%"></div>
      </div>
      <div class="progress-grid">
        <span>Trạng thái: ${escapeHtml(status.status || 'idle')}</span>
        <span>Series: ${escapeHtml(status.seriesId || 'tất cả')}</span>
        <span>Chapter hiện tại: ${escapeHtml(status.currentChapter || 'đang tính')}</span>
        <span>Upload: ${Number(status.uploaded || 0).toLocaleString('vi-VN')}</span>
        <span>Skip S3: ${Number(status.skipped || 0).toLocaleString('vi-VN')}</span>
        <span>Skip cache local: ${Number(status.cachedSkipped || 0).toLocaleString('vi-VN')}</span>
        <span>Lỗi: ${Number(status.failed || 0).toLocaleString('vi-VN')}</span>
        <span>Tốc độ: ${Number(status.ratePerMinute || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} file/phút</span>
        <span>ETA: ${escapeHtml(status.eta || 'đang tính')}</span>
        <span>Luồng: ${Number(status.concurrency || 0) || '?'}</span>
      </div>
      ${status.currentKey ? `<div class="production-log"><span>${escapeHtml(status.currentKey)}</span></div>` : ''}
      ${failedItems.length ? renderS3FailedItems(failedItems) : ''}
      ${failedItems.length ? '<button class="ghost-btn" type="button" data-s3-retry-failed>Retry file thiếu</button>' : ''}
    `;
  }

  function renderS3FailedItems(failedItems = []) {
    return `
      <div class="progress-errors">
        <strong>File S3 lỗi gần nhất</strong>
        ${failedItems.slice(-8).map((item) => {
          const error = String(item.error || '');
          const clockHint = /RequestTimeTooSkewed|request time|clock skew/i.test(error)
            ? ' - Gợi ý: bật đồng bộ giờ Windows rồi bấm retry.'
            : '';
          return `<span>${escapeHtml(item.key || '')}: ${escapeHtml(error)}${escapeHtml(clockHint)}</span>`;
        }).join('')}
      </div>
    `;
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
            ${renderAdminProductionBadge(series)}
          </div>
        </div>
        <div class="admin-series-card-actions">
          <a class="primary-btn" data-link href="/admin/series/${escapeAttr(series.id)}">Quản lý</a>
          ${localOps ? `<button class="ghost-btn" type="button" data-update-chapters="${escapeAttr(series.id)}" ${sourceUrl ? '' : 'disabled'}>Cập nhật chapter mới</button>` : ''}
          ${localOps ? `<button class="ghost-btn production-quick-btn" type="button" data-publish-production="${escapeAttr(series.id)}">Tối ưu + sync S3</button>` : ''}
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
            ${renderAdminProductionBadge(series)}
          </div>
          ${localOps ? `<div class="admin-detail-actions">
            <button class="ghost-btn" type="button" data-update-chapters="${escapeAttr(series.id)}" ${sourceUrl ? '' : 'disabled'}>Cập nhật chapter mới</button>
            <span class="muted">${sourceUrl ? 'Chỉ tải chapter chưa có, không tải lại ảnh cũ.' : 'Chưa có source URL để cập nhật.'}</span>
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
    const steps = [
      {
        key: 'update-chapters',
        label: '1. Crawl chapter mới',
        description: sourceUrl ? 'Chỉ tải chapter chưa có, không tải lại ảnh cũ.' : 'Cần source URL trước khi cập nhật chapter.',
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
        key: 'export-static-api',
        label: '4. Export static API',
        description: 'Sinh lại static API sau khi ảnh/catalog đã sẵn sàng.',
        button: 'Export API',
        steps: ['export-static-api']
      },
      {
        key: 'sync-static-api',
        label: '5. Sync static API',
        description: 'Đẩy riêng JSON static API lên S3 để production cập nhật.',
        button: 'Sync static API',
        steps: ['sync-static-api']
      },
      {
        key: 'production-check',
        label: '6. Kiểm tra production',
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
          <button class="primary-btn" type="button" data-publish-production="${escapeAttr(series.id)}">Chạy nhanh: optimize + sync + export</button>
        </div>
        <div class="production-pipeline-list" aria-label="Production pipeline steps">
          ${steps.map((step) => renderProductionPipelineStep(series, step, productionUrl)).join('')}
        </div>
        <div class="production-publish-note">
          <span>Khuyến nghị: crawl mới -> optimize -> sync ảnh S3 -> export API -> sync static API -> check production.</span>
          ${productionUrl ? `<a href="${escapeAttr(productionUrl)}" target="_blank" rel="noopener noreferrer">Mở production</a>` : '<span>Truyện chưa có slug public để mở production.</span>'}
        </div>
        <div class="status-line admin-wide production-publish-status" data-production-publish-status="${escapeAttr(series.id)}"></div>
      </section>
    `;
  }

  function renderProductionPipelineStep(series, step, productionUrl) {
    const action = step.check
      ? `data-production-check="${escapeAttr(series.id)}" data-production-url="${escapeAttr(productionUrl)}"`
      : step.buttonAttr || `data-production-step="${escapeAttr(series.id)}" data-steps="${escapeAttr((step.steps || []).join(','))}"`;
    return `
      <article class="production-pipeline-step is-${escapeAttr(step.key)}">
        <div>
          <strong>${escapeHtml(step.label)}</strong>
          <p>${escapeHtml(step.description)}</p>
        </div>
        <button class="ghost-btn" type="button" ${action} ${step.disabled ? 'disabled' : ''}>${escapeHtml(step.button)}</button>
      </article>
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

  function adminSeriesStats(series) {
    const chapters = Array.isArray(series.chapters) ? series.chapters : [];
    const status = series.status || 'draft';
    return {
      status,
      chapterCount: Number(series.chapterCount || chapters.length || 0),
      importedChapterCount: Number(series.importedChapterCount || series.chapterCount || chapters.length || 0),
      pageCount: Number(series.pageCount || 0),
      draftCount: chapters.filter((chapter) => (chapter.status || 'draft') === 'draft').length,
      removedCount: chapters.filter((chapter) => chapter.status === 'removed').length,
      missingImageCount: chapters.filter((chapter) => !hasReadableChapter(chapter)).length
    };
  }

  function renderAdminSeriesBadges(stats) {
    return `
      <div class="admin-series-badges">
        <span class="admin-series-status is-${normalizeStatusClass(stats.status)}">${escapeHtml(statusLabel(stats.status))}</span>
        ${stats.draftCount ? `<span>${stats.draftCount} draft</span>` : ''}
        ${stats.removedCount ? `<span>${stats.removedCount} đã ẩn</span>` : ''}
        ${stats.missingImageCount ? `<span>${stats.missingImageCount} thiếu ảnh</span>` : ''}
      </div>
    `;
  }

  function productionStatusForSeries(series = {}) {
    return adminProductionStatus?.statuses?.[series.id] || null;
  }

  function renderAdminProductionBadge(series = {}) {
    const status = productionStatusForSeries(series);
    const state = status?.state || 'unchecked';
    const images = status?.images || {};
    const staticApi = status?.staticApi || {};
    const sync = status?.sync || null;
    const title = status
      ? [
        `Ảnh S3: ${Number(images.uploaded || 0)}/${Number(images.total || 0)}`,
        `Static series: ${staticApi.series ? 'có' : 'thiếu'}`,
        `Reader API: ${Number(staticApi.readerCount || 0)} file`,
        sync ? `Đang sync: ${Number(sync.percent || 0)}% - ETA ${sync.eta || 'đang tính'}` : ''
      ].filter(Boolean).join(' · ')
      : 'Chưa có dữ liệu sync local để kết luận.';
    return `
      <div class="admin-production-badge-row">
        <span class="admin-production-badge is-${escapeAttr(productionStatusClass(state))}" title="${escapeAttr(title)}">
          ${productionStatusIcon(state)} ${escapeHtml(status?.label || 'Chưa kiểm tra')}
        </span>
        ${renderAdminProductionMiniStats(status)}
      </div>
    `;
  }

  function renderAdminProductionMiniStats(status) {
    if (!status) return '<small>Chưa có dữ liệu S3 sync state.</small>';
    if (status.state === 'syncing') {
      return `<small>${Number(status.sync?.percent || 0)}% · ETA ${escapeHtml(status.sync?.eta || 'đang tính')}</small>`;
    }
    if (status.state === 'missing-images') {
      return `<small>Thiếu ${Number(status.images?.missing || 0).toLocaleString('vi-VN')} ảnh</small>`;
    }
    if (status.state === 'missing-static-api') {
      return '<small>Ảnh đã có, cần sync static API</small>';
    }
    if (status.state === 'ok') {
      return '<small>Ảnh + API đã có trong state</small>';
    }
    return `<small>${escapeHtml(status.label || 'Chưa kiểm tra')}</small>`;
  }

  function productionStatusClass(state = '') {
    if (state === 'ok') return 'ok';
    if (state === 'syncing') return 'syncing';
    if (state === 'missing-images' || state === 'missing-static-api') return 'warning';
    if (state === 'not-public') return 'draft';
    return 'unchecked';
  }

  function productionStatusIcon(state = '') {
    if (state === 'ok') return '✓';
    if (state === 'syncing') return '...';
    if (state === 'missing-images' || state === 'missing-static-api') return '!';
    return '○';
  }

  function statusLabel(status) {
    if (status === 'public') return 'Public';
    if (status === 'removed') return 'Removed';
    return 'Draft';
  }

  function normalizeStatusClass(status) {
    return ['public', 'draft', 'removed'].includes(status) ? status : 'draft';
  }

  function sourceUrlForAdminSeries(series = {}) {
    return series.sourceUrl || series.sourceMappings?.find((mapping) => mapping.sourceUrl)?.sourceUrl || '';
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

  function renderOriginTagPicker(series = {}) {
    const currentOrigin = detectOriginType(getSeriesTagNames(series));
    return `
      <div class="admin-origin-picker admin-wide">
        <div>
          <strong>Phân loại quốc gia</strong>
          <span>Quản lý tag hiển thị ở trang chủ: Truyện Hàn / Truyện Trung.</span>
        </div>
        <div class="admin-origin-options">
          ${getOriginTagOptions().map((option) => `
            <label class="admin-origin-option ${currentOrigin === option.value ? 'active' : ''}">
              <input type="radio" name="originType" value="${escapeAttr(option.value)}" ${currentOrigin === option.value ? 'checked' : ''} />
              <span>
                <strong>${escapeHtml(option.label)}</strong>
                <small>${escapeHtml(option.hint)}</small>
              </span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }

  function getOriginTagOptions() {
    return [
      { value: '', label: 'Chưa rõ', hint: 'Không gắn tag quốc gia', tags: [] },
      { value: 'manhwa', label: 'Truyện Hàn', hint: 'Gắn Manhwa + Truyện Hàn', tags: ['Manhwa', 'Truyện Hàn'] },
      { value: 'manhua', label: 'Truyện Trung', hint: 'Gắn Manhua + Truyện Trung', tags: ['Manhua', 'Truyện Trung'] }
    ];
  }

  function getSeriesTagNames(series = {}) {
    return (series.tags || [])
      .map((tag) => String(typeof tag === 'string' ? tag : tag?.name || tag?.slug || '').trim())
      .filter(Boolean);
  }

  function getManualTagNames(series = {}) {
    return getSeriesTagNames(series).filter((tag) => !isOriginTagName(tag));
  }

  function mergeTagsWithOrigin(tags = [], originType = '') {
    const option = getOriginTagOptions().find((item) => item.value === originType) || getOriginTagOptions()[0];
    return uniqueTagNames([
      ...(tags || []).filter((tag) => !isOriginTagName(tag)),
      ...option.tags
    ]);
  }

  function uniqueTagNames(tags = []) {
    const seen = new Set();
    const unique = [];
    for (const tag of tags) {
      const name = String(tag || '').trim();
      const key = normalizeAdminTagName(name);
      if (!name || seen.has(key)) continue;
      seen.add(key);
      unique.push(name);
    }
    return unique;
  }

  function detectOriginType(tags = []) {
    const normalized = new Set(tags.map((tag) => normalizeAdminTagName(tag)));
    if (normalized.has('manhua') || normalized.has('truyen-trung')) return 'manhua';
    if (normalized.has('manhwa') || normalized.has('truyen-han')) return 'manhwa';
    return '';
  }

  function isOriginTagName(tag = '') {
    return ['manhwa', 'manhua', 'truyen-han', 'truyen-trung'].includes(normalizeAdminTagName(tag));
  }

  function normalizeAdminTagName(value = '') {
    return String(value)
      .toLowerCase()
      .replace(/đ/g, 'd')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
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

  function bindProductionPipelineActions() {
    app.querySelectorAll('[data-update-chapters]').forEach((button) => button.addEventListener('click', handleUpdateChapters));
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
        status.textContent = error.message;
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
        status.textContent = `Check production loi: ${error.message}`;
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
    const steps = Array.isArray(job.steps) ? job.steps : [];
    const done = steps.filter((step) => step.status === 'completed').length;
    const percent = steps.length ? Math.round((done / steps.length) * 100) : 0;
    const activeStep = steps.find((step) => step.status === 'running') || steps.find((step) => step.status === 'failed') || steps[steps.length - 1] || {};
    const logs = Array.isArray(job.logs) ? job.logs.slice(-6) : [];
    status.className = `status-line production-progress${job.status === 'failed' ? ' error' : ''}`;
    status.innerHTML = `
      <div class="progress-copy">
        <strong>${escapeHtml(productionJobMessage(job, activeStep))}</strong>
        <span>${done}/${steps.length || '?'} bước - ${escapeHtml(job.status || 'running')}</span>
      </div>
      <div class="crawl-meter" aria-label="Tiến độ production workflow">
        <div style="width:${Math.max(4, Math.min(100, percent))}%"></div>
      </div>
      <div class="production-step-list">
        ${steps.map((step, index) => `
          <article class="production-step is-${escapeAttr(step.status || 'pending')}">
            <b>${productionStepIcon(step.status)} ${index + 1}. ${escapeHtml(step.label || step.key || 'Bước')}</b>
            <span>${escapeHtml(step.description || '')}</span>
            ${renderProductionStepProgress(step)}
            ${step.error ? `<small>${escapeHtml(step.error)}</small>` : step.output && step.status === 'completed' ? `<small>${escapeHtml(step.output.split('\n').slice(-2).join(' · '))}</small>` : ''}
          </article>
        `).join('')}
      </div>
      ${logs.length ? `<div class="production-log">${logs.map((log) => `<span>${escapeHtml(log.text || '')}</span>`).join('')}</div>` : ''}
    `;
  }

  function renderProductionStepProgress(step = {}) {
    const progress = step.progress || {};
    const total = Number(progress.total || 0);
    if (!total) return '';
    const checked = Number(progress.checked || 0);
    const percent = Math.round((checked / total) * 100);
    return `
      <div class="production-step-progress">
        <div class="crawl-meter" aria-label="Tiến độ ${escapeAttr(step.label || step.key || 'sync')}">
          <div style="width:${Math.max(4, Math.min(100, percent))}%"></div>
        </div>
        <div class="production-step-metrics">
          <span>Đã kiểm tra: ${checked}/${total}</span>
          <span>Upload: ${Number(progress.uploaded || 0)}</span>
          <span>Skip: ${Number(progress.skipped || 0)}</span>
          <span>Skip cache local: ${Number(progress.cached || progress.cachedSkipped || 0)}</span>
          <span>Lỗi: ${Number(progress.failed || 0)}</span>
          <span>Tốc độ: ${Number(progress.ratePerMinute || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} file/phút</span>
          <span>ETA: ${escapeHtml(progress.eta || 'đang tính')}</span>
          <span>Luồng: ${Number(progress.concurrency || 0) || '?'}</span>
        </div>
      </div>
    `;
  }

  function productionJobMessage(job, activeStep = {}) {
    if (job.status === 'completed') return job.result?.message || 'Đã sync production xong.';
    if (job.status === 'failed') return job.error || activeStep.error || 'Workflow production bị lỗi.';
    if (activeStep.label) return `Đang chạy: ${activeStep.label}`;
    return 'Đang chuẩn bị workflow production...';
  }

  function productionStepIcon(status) {
    if (status === 'completed') return '✓';
    if (status === 'running') return '…';
    if (status === 'failed') return '!';
    return '○';
  }

  function formatCrawlDuration(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value < 0) return 'đang tính';
    if (value < 60) return `${Math.max(1, Math.round(value))} giây`;
    const minutes = Math.floor(value / 60);
    const remainingSeconds = Math.round(value % 60);
    if (minutes < 60) return remainingSeconds ? `${minutes} phút ${remainingSeconds} giây` : `${minutes} phút`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes ? `${hours} giờ ${remainingMinutes} phút` : `${hours} giờ`;
  }

  function formatCrawlRate(value, suffix) {
    const rate = Number(value || 0);
    if (!rate) return `0 ${suffix}`;
    return `${rate.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} ${suffix}`;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
  }

  function renderImportProgress(status, job) {
    if (!status) return;
    const progress = job.progress || {};
    const chapterTotal = Number(progress.totalChapters || 0);
    const chapterDone = Number(progress.processedChapters || 0);
    const imageTotal = Number(progress.totalImages || 0);
    const imageDone = Number(progress.processedImages || progress.downloadedImages || 0);
    const downloadedImages = Number(progress.downloadedImages || 0);
    const skippedExistingImages = Number(progress.skippedExistingImages || 0);
    const usableImages = Number(progress.usableImages ?? (downloadedImages + skippedExistingImages));
    const failedImages = Number(progress.failedImages || 0);
    const seriesTotal = Number(progress.totalSeries || 1);
    const seriesDone = Number(progress.processedSeries || 0);
    const errors = Array.isArray(progress.errors) ? progress.errors : [];
    const chapterPercent = chapterTotal ? chapterDone / chapterTotal : 0;
    const imagePercent = imageTotal ? imageDone / imageTotal : 0;
    const seriesPercent = seriesTotal ? seriesDone / seriesTotal : 0;
    const percent = Math.round((seriesPercent * 0.15 + chapterPercent * 0.35 + imagePercent * 0.5) * 100);
    const isAdminUpdateStatus = Boolean(status.hasAttribute && status.hasAttribute('data-update-chapters-status'));
    status.className = `status-line import-progress${job.status === 'failed' ? ' error' : ''}${isAdminUpdateStatus ? ' admin-wide admin-update-status' : ''}`;
    status.innerHTML = `
      <div class="progress-copy">
        <strong>${escapeHtml(progress.message || 'Đang import...')}</strong>
        <span>${escapeHtml(progress.currentChapterLabel || progress.currentSeriesUrl || progress.phase || '')}</span>
      </div>
      <div class="crawl-meter" aria-label="Tiến độ crawl">
        <div style="width:${Math.max(4, Math.min(100, percent))}%"></div>
      </div>
      <div class="progress-grid">
        <span>Truyện: ${seriesDone}/${seriesTotal}</span>
        <span>Phase: ${escapeHtml(progress.phase || job.status)}</span>
        <span>Chapter: ${chapterDone}/${chapterTotal || '?'}</span>
        <span>Ảnh xử lý: ${imageDone}/${imageTotal || '?'}</span>
        <span>Ảnh dùng được: ${usableImages}</span>
        <span>Tải mới: ${downloadedImages}</span>
        <span>Skip có sẵn: ${skippedExistingImages}</span>
        <span>Ảnh lỗi skip: ${failedImages}</span>
        <span>Tốc độ ảnh: ${formatCrawlRate(progress.imagesPerMinute, 'ảnh/phút')}</span>
        <span>Tốc độ chapter: ${formatCrawlRate(progress.chaptersPerMinute, 'chapter/phút')}</span>
        <span>ETA: ${formatCrawlDuration(progress.etaSeconds)}</span>
        <span>Concurrency: ${Number(progress.imageConcurrency || 1)}</span>
        <span>Trạng thái: ${escapeHtml(job.status)}</span>
        <span>Lỗi: ${Number(progress.errorCount || errors.length || 0)}</span>
      </div>
      ${errors.length ? `<div class="progress-errors">${errors.slice(-3).map((error) => `<span>${escapeHtml(error)}</span>`).join('')}</div>` : ''}
    `;
  }

  function formatAdminBulletinTime(value = '') {
    const time = Date.parse(value);
    if (!time) return 'vừa xong';
    const diff = Date.now() - time;
    if (diff < 60_000) return 'vừa xong';
    if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} phút trước`;
    if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))} giờ trước`;
    return new Date(time).toLocaleDateString('vi-VN');
  }

  return {
    renderAdmin,
    renderAdminSeriesDetail
  };
}
