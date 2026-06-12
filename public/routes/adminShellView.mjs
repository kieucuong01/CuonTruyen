import { escapeAttr, escapeHtml } from '../domUtils.mjs';

export function renderAdminSessionBar(email = '') {
  return `
    <section class="admin-session-bar">
      <strong>${escapeHtml(email)}</strong>
      <button class="ghost-btn" type="button" data-admin-logout>Đăng xuất</button>
    </section>
  `;
}

export function renderAdminBulletinPanel(messages = [], { now = Date.now() } = {}) {
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
        ${messages.length ? messages.map((message) => renderAdminBulletinMessage(message, { now })).join('') : '<p class="muted">Chưa có tin nhắn bảng tin.</p>'}
      </div>
    </section>
  `;
}

export function renderAdminBulletinMessage(message = {}, { now = Date.now() } = {}) {
  const isAdmin = message.authorRole === 'admin';
  return `
    <article class="${message.pinned ? 'is-pinned' : ''}">
      <div>
        <strong>${escapeHtml(message.authorName || 'Reader')}</strong>
        ${message.pinned ? '<mark>GHIM</mark>' : isAdmin ? '<mark>ADMIN</mark>' : ''}
        <small>${escapeHtml(formatAdminBulletinTime(message.createdAt, { now }))}</small>
        <p>${escapeHtml(message.text || '')}</p>
      </div>
      ${isAdmin ? `<button class="ghost-btn" type="button" data-admin-bulletin-pin="${escapeAttr(message.id)}" data-pinned="${message.pinned ? 'true' : 'false'}">${message.pinned ? 'Bỏ ghim' : 'Ghim'}</button>` : '<span class="muted">User</span>'}
    </article>
  `;
}

export function renderProductionAdminNotice() {
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

export function renderS3SyncPanel(productionStatus = {}) {
  return `
    <section class="admin-panel s3-sync-panel">
      <div class="admin-bulletin-head">
        <div>
          <h2>Đồng bộ ảnh S3</h2>
          <p class="muted">Theo dõi tiến trình upload ảnh lên Vietnix S3 từ máy local.</p>
        </div>
      </div>
      ${renderCatalogStorageNotice(productionStatus)}
      <div class="status-line s3-sync-status" data-s3-sync-status>Đang kiểm tra tiến trình S3...</div>
    </section>
  `;
}

export function renderCatalogStorageNotice(productionStatus = {}) {
  const status = productionStatus || {};
  const storage = status.storage || {};
  const postgres = storage.postgres || {};
  const productionPostgres = storage.productionPostgres || {};
  const label = storage.mode === 'postgres'
    ? `Postgres${postgres.host ? ` - ${postgres.host}${postgres.database ? `/${postgres.database}` : ''}` : ''}`
    : 'JSON local';
  const productionLabel = productionPostgres.configured
    ? `configured${productionPostgres.host ? ` - ${productionPostgres.host}${productionPostgres.database ? `/${productionPostgres.database}` : ''}` : ''}`
    : 'missing PRODUCTION_CATALOG_DATABASE_URL';
  const productionRelation = productionPostgres.sameAsSource
    ? 'same as source DB'
    : productionPostgres.configured ? 'separate target DB' : '';
  const source = postgres.source ? ` (${postgres.source})` : '';
  const hints = Array.isArray(status.hints) ? status.hints : [];

  return `
    <div class="status-line admin-wide catalog-storage-notice${status.error ? ' error' : ''}">
      <strong>Catalog storage:</strong> ${escapeHtml(label + source)}
      <span>Production DB target: ${escapeHtml(productionLabel)}</span>
      ${productionRelation ? `<span>Production DB mode: ${escapeHtml(productionRelation)}</span>` : ''}
      ${status.error ? `<span>${escapeHtml(status.error)}</span>` : ''}
      ${status.cause ? `<small>${escapeHtml(status.cause)}</small>` : ''}
      ${hints.length ? `<small>${hints.map((hint) => escapeHtml(hint)).join(' | ')}</small>` : ''}
    </div>
  `;
}

export function renderCrawlQueuePanel() {
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

export function formatAdminBulletinTime(value = '', { now = Date.now() } = {}) {
  const time = Date.parse(value);
  if (!time) return 'vừa xong';
  const diff = now - time;
  if (diff < 60_000) return 'vừa xong';
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} phút trước`;
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))} giờ trước`;
  return new Date(time).toLocaleDateString('vi-VN');
}
