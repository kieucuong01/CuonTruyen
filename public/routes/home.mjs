export const STATIC_INFO_PAGES = {
  '/gioi-thieu': {
    title: 'Giới thiệu Cuộn Truyện',
    body: 'Cuộn Truyện tập trung vào trải nghiệm đọc truyện tranh online mượt, nối chapter liên tục và tự lưu vị trí đọc trên trình duyệt.'
  },
  '/lien-he': {
    title: 'Liên hệ',
    body: 'Báo lỗi truyện, góp ý trải nghiệm đọc hoặc gửi yêu cầu xử lý nội dung để quản trị viên kiểm tra và ẩn nội dung khi cần.'
  },
  '/chinh-sach-noi-dung': {
    title: 'Chính sách nội dung',
    body: 'Quản trị viên có thể ẩn truyện hoặc chapter khỏi trang public và sitemap. Chỉ vận hành nguồn nội dung mà chủ sở hữu được phép sử dụng.'
  },
  '/privacy': {
    title: 'Privacy',
    body: 'Lịch sử đọc, danh sách theo dõi và vị trí đọc được lưu trên trình duyệt. Sự kiện đọc được dùng để cải thiện trải nghiệm sản phẩm.'
  }
};

export function createHomeRoute({
  app,
  state,
  bindContinueSlider,
  bindReadButtons,
  escapeAttr,
  escapeHtml,
  fetchJson,
  icon,
  loadHome,
  loadLastSeriesId,
  loadProgress,
  loadReadingHistory,
  renderContinueShelf,
  renderMonetizationPanel,
  renderPopularSidebar,
  renderRail,
  renderTopbar,
  renderTrendingSection,
  renderUpdatedSection,
  reportVisibleAdSlots,
  route,
  sendEvent,
  stopReaderRuntime,
  throttle,
  uniqueSeriesById
}) {
  async function renderHome() {
    stopReaderRuntime();
    const home = await loadHome();
    const homeSeries = uniqueSeriesById([...(home.hot || []), ...(home.updated || [])]);
    const historyIds = loadReadingHistory();
    const missingHistoryIds = historyIds.filter((seriesId) => !homeSeries.some((series) => series.id === seriesId));
    const historySeries = await Promise.all(
      missingHistoryIds.map((seriesId) => fetchJson(`/api/series/${encodeURIComponent(seriesId)}`).catch(() => null))
    );
    const seriesLookup = new Map(
      [...homeSeries, ...historySeries.filter(Boolean)].map((series) => [series.id, series])
    );
    const lastSeriesId = loadLastSeriesId();
    const lastSeries = seriesLookup.get(lastSeriesId);
    const readingSeries = historyIds
      .map((seriesId) => seriesLookup.get(seriesId))
      .filter(Boolean)
      .map((series) => ({ series, progress: loadProgress(series.id) }));
    const results = state.searchQuery
      ? (await fetchJson(`/api/search?q=${encodeURIComponent(state.searchQuery)}`)).series
      : [];
    const popular = home.hot.length ? home.hot : homeSeries;
    const updated = home.updated.length ? home.updated : homeSeries;

    app.innerHTML = `
      <main class="site-shell home-shell app-home-shell">
        ${renderTopbar()}
        <section class="app-home-hero">
          <div class="app-home-hero-copy">
            <p class="eyebrow">Cuộn Truyện</p>
            <h2>Đọc truyện mượt như app</h2>
            <p>Manhwa, manhua, manga online. Tự lưu vị trí, mở lại đúng chương và đọc liền mạch trên điện thoại.</p>
          </div>
          <div class="app-home-search" id="search">
            ${icon.search}
            <input data-search-input placeholder="Tìm truyện, tác giả, thể loại..." value="${escapeAttr(state.searchQuery)}" />
          </div>
          <div class="app-home-stats" aria-label="Thống kê nhanh">
            <span><strong>${homeSeries.length}</strong><small>truyện</small></span>
            <span><strong>${updated.length}</strong><small>mới cập nhật</small></span>
            <span><strong>${home.tags.length}</strong><small>thể loại</small></span>
          </div>
        </section>
        <section class="app-quick-actions" aria-label="Lối tắt">
          <a href="#continue-section"><strong>Đọc tiếp</strong><span>Quay lại truyện đang đọc</span></a>
          <a href="#/history"><strong>Lịch sử</strong><span>Những truyện đã mở</span></a>
          <a href="#/followed"><strong>Theo dõi</strong><span>Danh sách lưu local</span></a>
        </section>
        <section class="app-home-feed">
          ${renderContinueShelf(readingSeries, lastSeries)}
          ${state.searchQuery ? renderRail('Kết quả tìm kiếm', results, 'compact app-search-results') : ''}
          ${renderTrendingSection(popular.slice(0, 8))}
          ${renderUpdatedSection(updated)}
          <section class="tag-cloud app-tag-cloud" id="genres">
            <h2 class="section-title">Thể loại nổi bật</h2>
            <div>${home.tags.length ? home.tags.map((tag) => `<a data-link href="/the-loai/${tag.slug}">${escapeHtml(tag.name)} <small>${tag.seriesCount}</small></a>`).join('') : '<span class="muted">Chưa có tag.</span>'}</div>
          </section>
          ${renderMonetizationPanel('home')}
        </section>
        <nav class="mobile-home-tabbar" aria-label="Điều hướng nhanh">
          <a data-link href="/"><strong>Nhà</strong></a>
          <a href="#continue-section"><strong>Đọc tiếp</strong></a>
          <a href="#/history"><strong>Lịch sử</strong></a>
          <a href="#search"><strong>Tìm</strong></a>
        </nav>
      </main>
    `;

    app.querySelectorAll('[data-search-input]').forEach((input) => input.addEventListener('input', throttle((event) => {
      state.searchQuery = event.target.value.trim();
      renderHome().then(() => reportVisibleAdSlots());
    }, 350)));
    app.querySelector('.small-orange')?.addEventListener('click', () => {
      history.pushState({}, '', '#/search');
      route();
    });
    bindReadButtons();
    bindContinueSlider();
    sendEvent('pageview', {});
    reportVisibleAdSlots();
  }

  function renderStaticInfoPage(pathname) {
    stopReaderRuntime();
    const page = STATIC_INFO_PAGES[pathname];
    app.innerHTML = `
      <main class="site-shell static-page">
        ${renderTopbar()}
        <section class="page-heading">
          <h2>${escapeHtml(page.title)}</h2>
          <p>${escapeHtml(page.body)}</p>
        </section>
      </main>
    `;
    sendEvent('pageview', { page: pathname });
  }

  return {
    renderHome,
    renderStaticInfoPage
  };
}
