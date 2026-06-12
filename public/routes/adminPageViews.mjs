export function renderAdminImportPanel() {
  return `<form class="import-panel admin-panel" data-import-form>
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
  </form>`;
}

export function renderAdminDashboardPage({
  topbarHtml,
  sessionBarHtml,
  localOps,
  productionNoticeHtml,
  crawlQueuePanelHtml,
  bulletinPanelHtml,
  s3SyncPanelHtml,
  revenueDashboardHtml,
  flashMessage,
  series,
  renderSeriesCard,
  escapeHtml
}) {
  const catalogSeries = Array.isArray(series) ? series : [];
  const flashHtml = flashMessage ? `<div class="status-line success">${escapeHtml(flashMessage)}</div>` : '';
  const seriesHtml = catalogSeries.length
    ? `<div class="admin-series-list-grid">${catalogSeries.map(renderSeriesCard).join('')}</div>`
    : '<div class="empty-state">Chưa có truyện để quản lý.</div>';

  return `
    <main class="site-shell admin-shell">
      ${topbarHtml}
      ${sessionBarHtml}
      <section class="admin-grid">
        ${localOps ? renderAdminImportPanel() : productionNoticeHtml}
        ${localOps ? crawlQueuePanelHtml : ''}
        ${bulletinPanelHtml}
        ${localOps ? s3SyncPanelHtml : ''}
        <div class="status-line" data-status></div>
      </section>
      ${revenueDashboardHtml}
      ${flashHtml}
      <section class="admin-list">
        <div class="admin-list-head">
          <div>
            <h2 class="section-title">CMS truyện</h2>
            <p class="muted">Chọn một truyện để mở trang quản lý riêng. Danh sách này chỉ giữ thông tin nhận diện và thao tác nhanh.</p>
          </div>
        </div>
        ${seriesHtml}
      </section>
    </main>
  `;
}

export function renderAdminSeriesDetailPage({
  topbarHtml,
  sessionBarHtml,
  localOps,
  productionNoticeHtml,
  flashMessage,
  series,
  editorHtml,
  escapeHtml,
  escapeAttr
}) {
  const publicLinkHtml = series?.slug
    ? `<a class="ghost-btn" data-link href="/truyen/${escapeAttr(series.slug)}">Mở trang public</a>`
    : '';
  const flashHtml = flashMessage ? `<div class="status-line success">${escapeHtml(flashMessage)}</div>` : '';
  const bodyHtml = series
    ? editorHtml
    : '<section class="empty-state">Không tìm thấy truyện trong catalog admin.</section>';

  return `
    <main class="site-shell admin-shell admin-detail-shell">
      ${topbarHtml}
      ${sessionBarHtml}
      <div class="admin-detail-nav">
        <a class="ghost-btn" data-link href="/admin">Quay lại CMS</a>
        ${publicLinkHtml}
      </div>
      ${flashHtml}
      ${!localOps ? productionNoticeHtml : ''}
      ${bodyHtml}
    </main>
  `;
}
