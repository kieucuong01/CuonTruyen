import { hasReadableChapter } from '../chapterState.mjs';

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

  async function loadAdminCatalog() {
    return fetchJson('/api/admin/series', { headers: adminHeaders() });
  }

  async function loadAdminBulletin() {
    return fetchJson('/api/admin/bulletin/messages?limit=40', { headers: adminHeaders() })
      .catch(() => ({ messages: [] }));
  }

  async function renderAdmin() {
    stopReaderRuntime();
    if (!loadAdminToken()) {
      renderAdminLogin();
      return;
    }
    let catalog;
    let bulletin;
    try {
      [catalog, bulletin] = await Promise.all([
        loadAdminCatalog(),
        loadAdminBulletin()
      ]);
    } catch (error) {
      if (isAdminAuthError(error)) {
        clearAdminSession();
        renderAdminLogin('Phiên admin đã hết hạn, vui lòng đăng nhập lại.');
        return;
      }
      throw error;
    }
    app.innerHTML = `
      <main class="site-shell admin-shell">
        ${renderTopbar()}
        ${renderAdminSessionBar()}
        <section class="admin-grid">
          <form class="import-panel admin-panel" data-import-form>
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
          </form>
          ${renderAdminBulletinPanel(bulletin.messages || [])}
          <div class="status-line" data-status></div>
        </section>
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
    app.querySelector('[data-import-form]').addEventListener('submit', handleImport);
    bindAdminBulletinActions();
    app.querySelectorAll('[data-update-chapters]').forEach((button) => button.addEventListener('click', handleUpdateChapters));
  }

  async function renderAdminSeriesDetail(seriesId) {
    stopReaderRuntime();
    if (!loadAdminToken()) {
      renderAdminLogin();
      return;
    }
    let catalog;
    try {
      catalog = await loadAdminCatalog();
    } catch (error) {
      if (isAdminAuthError(error)) {
        clearAdminSession();
        renderAdminLogin('Phiên admin đã hết hạn, vui lòng đăng nhập lại.');
        return;
      }
      throw error;
    }
    const series = findAdminSeries(catalog, seriesId);
    app.innerHTML = `
      <main class="site-shell admin-shell admin-detail-shell">
        ${renderTopbar()}
        ${renderAdminSessionBar()}
        <div class="admin-detail-nav">
          <a class="ghost-btn" data-link href="/admin">Quay lại CMS</a>
          ${series?.slug ? `<a class="ghost-btn" data-link href="/truyen/${escapeAttr(series.slug)}">Mở trang public</a>` : ''}
        </div>
        ${adminFlashMessage ? `<div class="status-line success">${escapeHtml(adminFlashMessage)}</div>` : ''}
        ${series ? renderAdminSeriesEditor(series) : '<section class="empty-state">Không tìm thấy truyện trong catalog admin.</section>'}
      </main>
    `;
    adminFlashMessage = '';
    bindAdminCommonActions();
    bindAdminImageFallbacks();
    app.querySelectorAll('[data-admin-series]').forEach((form) => form.addEventListener('submit', handleAdminSave));
    app.querySelectorAll('[data-update-chapters]').forEach((button) => button.addEventListener('click', handleUpdateChapters));
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

  function bindAdminCommonActions() {
    app.querySelector('[data-admin-logout]')?.addEventListener('click', () => {
      clearAdminSession();
      route();
    });
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
    return `
      <article class="admin-series-card admin-series-list-card">
        <div class="admin-series-summary">
          ${renderAdminSeriesCover(series)}
          <div class="admin-series-summary-copy">
            <strong title="${escapeAttr(series.title)}">${escapeHtml(series.title)}</strong>
            <span>${stats.importedChapterCount}/${stats.chapterCount} chapter - ${stats.pageCount} ảnh</span>
            ${renderAdminSeriesBadges(stats)}
          </div>
        </div>
        <div class="admin-series-card-actions">
          <a class="primary-btn" data-link href="/admin/series/${escapeAttr(series.id)}">Quản lý</a>
          <button class="ghost-btn" type="button" data-update-chapters="${escapeAttr(series.id)}" ${sourceUrl ? '' : 'disabled'}>Cập nhật chapter mới</button>
          ${series.slug ? `<a class="ghost-btn" data-link href="/truyen/${escapeAttr(series.slug)}">Mở public</a>` : ''}
        </div>
        <div class="status-line admin-update-status" data-update-chapters-status="${escapeAttr(series.id)}"></div>
      </article>
    `;
  }

  function renderAdminSeriesEditor(series) {
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
          </div>
          <div class="admin-detail-actions">
            <button class="ghost-btn" type="button" data-update-chapters="${escapeAttr(series.id)}" ${sourceUrl ? '' : 'disabled'}>Cập nhật chapter mới</button>
            <span class="muted">${sourceUrl ? 'Chỉ tải chapter chưa có, không tải lại ảnh cũ.' : 'Chưa có source URL để cập nhật.'}</span>
          </div>
        </section>
        <div class="status-line admin-wide admin-update-status" data-update-chapters-status="${escapeAttr(series.id)}"></div>
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
            <label>Tags<input name="tags" value="${escapeAttr((series.tags || []).map((tag) => tag.name || tag).join(', '))}" placeholder="Manhua, Action" /></label>
            <label class="admin-wide">Mô tả SEO<textarea name="description" aria-label="Mô tả" placeholder="Mô tả SEO">${escapeHtml(series.description || '')}</textarea></label>
            <label class="toggle-row"><input name="scheduleEnabled" type="checkbox" ${schedule.enabled ? 'checked' : ''} /> Auto crawl</label>
            <label>Interval giờ<input name="intervalHours" type="number" min="1" value="${Number(schedule.intervalHours || 24)}" /></label>
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
      tags: splitList(formData.get('tags')),
      description: formData.get('description'),
      status: formData.get('status'),
      crawlSchedule: {
        enabled: formData.get('scheduleEnabled') === 'on',
        intervalHours: Number(formData.get('intervalHours') || 24)
      }
    };

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

  async function handleAdminBulletinSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = app.querySelector('[data-admin-bulletin-status]');
    const button = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    button.disabled = true;
    if (status) {
      status.className = 'status-line';
      status.textContent = 'Đang gửi tin admin...';
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
      adminFlashMessage = 'Đã gửi tin lên bảng tin.';
      await renderAdmin();
    } catch (error) {
      if (status) {
        status.className = 'status-line error';
        status.textContent = error.message;
      }
    } finally {
      button.disabled = false;
    }
  }

  async function handleAdminBulletinPin(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const status = app.querySelector('[data-admin-bulletin-status]');
    const id = button.dataset.adminBulletinPin;
    const pinned = button.dataset.pinned !== 'true';
    button.disabled = true;
    if (status) {
      status.className = 'status-line';
      status.textContent = pinned ? 'Đang ghim tin...' : 'Đang bỏ ghim...';
    }
    try {
      await fetchJson(`/api/admin/bulletin/messages/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify({ pinned })
      });
      adminFlashMessage = pinned ? 'Đã ghim tin admin.' : 'Đã bỏ ghim tin admin.';
      await renderAdmin();
    } catch (error) {
      if (status) {
        status.className = 'status-line error';
        status.textContent = error.message;
      }
    } finally {
      button.disabled = false;
    }
  }

  async function handleImport(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = app.querySelector('[data-status]');
    const button = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const urls = parseImportUrls(formData.get('url'));
    status.className = 'status-line';
    status.textContent = urls.length > 1 ? `Đang tạo ${urls.length} job crawl...` : 'Đang tạo job crawl...';
    button.disabled = true;
    button.textContent = 'Đang tạo job';
  
    try {
      if (!urls.length) throw new Error('Vui lòng nhập ít nhất 1 URL truyện.');
      const result = await fetchJson('/api/admin/import-jobs', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          url: urls.join('\n'),
          urls,
          maxChapters: Number(formData.get('maxChapters')),
          maxPages: Number(formData.get('maxPages'))
        })
      });
      const jobs = normalizeJobResults(result);
      if (jobs.length === 1) {
        if (jobs[0].reused) status.textContent = 'URL này đang có job chạy, đang theo dõi job cũ...';
        await pollImportJob(jobs[0].job.id, status, { navigateOnComplete: true });
        return;
      }
      renderImportBatch(status, jobs);
      const settled = await Promise.allSettled(jobs.map(({ job }) => pollImportJob(
        job.id,
        status.querySelector(`[data-job-status="${CSS.escape(job.id)}"]`),
        { navigateOnComplete: false }
      )));
      const failed = settled.filter((item) => item.status === 'rejected');
      if (failed.length) {
        status.classList.add('error');
        const summary = status.querySelector('[data-batch-summary]');
        if (summary) summary.textContent = `Hoàn tất ${jobs.length - failed.length}/${jobs.length} job, ${failed.length} job lỗi.`;
        return;
      }
      await loadCatalog();
      invalidateContentCache();
      const summary = status.querySelector('[data-batch-summary]');
      if (summary) summary.textContent = `Đã crawl xong ${jobs.length}/${jobs.length} URL. Vào CMS hoặc trang chủ để đọc.`;
    } catch (error) {
      status.className = 'status-line error';
      status.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = 'Crawl';
    }
  }

  function parseImportUrls(value) {
    const urls = String(value || '').match(/https?:\/\/[^\s,]+/gi) || [];
    return [
      ...new Set(
        urls
          .map((url) => url.trim())
          .filter(Boolean)
      )
    ];
  }

  function normalizeJobResults(result) {
    if (Array.isArray(result.jobs)) return result.jobs;
    if (result.job) return [{ job: result.job, reused: Boolean(result.reused) }];
    return [];
  }

  function renderImportBatch(status, jobs) {
    const reusedCount = jobs.filter((item) => item.reused).length;
    status.className = 'status-line batch-status';
    status.innerHTML = `
      <div class="batch-summary" data-batch-summary>
        Đang theo dõi ${jobs.length} job${reusedCount ? `, ${reusedCount} job đã có sẵn` : ''}.
      </div>
      <div class="batch-progress-list">
        ${jobs.map(({ job, reused }) => `
          <article class="batch-progress-card">
            <div class="batch-url">${escapeHtml(job.payload?.url || job.id)}</div>
            <div class="muted">${reused ? 'Reuse job đang chạy' : 'Job mới'}</div>
            <div data-job-status="${escapeAttr(job.id)}"></div>
          </article>
        `).join('')}
      </div>
    `;
  }

  async function pollImportJob(jobId, status, { navigateOnComplete = true } = {}) {
    while (true) {
      const job = await fetchJson(`/api/admin/import-jobs/${encodeURIComponent(jobId)}`, {
        headers: adminHeaders()
      });
      renderImportProgress(status, job);
      if (job.status === 'completed') {
        invalidateContentCache();
        await loadCatalog();
        await new Promise((resolve) => setTimeout(resolve, 650));
        if (navigateOnComplete) location.hash = `#/read/${encodeURIComponent(job.series.id)}`;
        return job.series;
      }
      if (job.status === 'failed') throw new Error(job.error || job.progress?.message || 'Import thất bại.');
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
  }

  function renderImportProgress(status, job) {
    if (!status) return;
    const progress = job.progress || {};
    const chapterTotal = Number(progress.totalChapters || 0);
    const chapterDone = Number(progress.processedChapters || 0);
    const imageTotal = Number(progress.totalImages || 0);
    const imageDone = Number(progress.downloadedImages || 0);
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
        <span>Ảnh: ${imageDone}/${imageTotal || '?'}</span>
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
