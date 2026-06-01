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
      <main class="site-shell home-shell">
        ${renderTopbar()}
        <section class="home-heading">
          <h2>Cuộn Truyện - Đọc truyện tranh manhwa, manhua online liền mạch</h2>
          <p>Đọc liên tục, tự lưu vị trí và mở lại đúng chương đang đọc.</p>
        </section>
        ${renderMonetizationPanel('home')}
        <section class="home-layout">
          <div class="home-main">
            ${renderContinueShelf(readingSeries, lastSeries)}
            ${state.searchQuery ? renderRail('Kết quả tìm kiếm', results, 'compact') : ''}
            ${renderTrendingSection(popular.slice(0, 5))}
            ${renderUpdatedSection(updated)}
            <section class="tag-cloud" id="genres">
              <h2 class="section-title">Thể loại nổi bật</h2>
              <div>${home.tags.length ? home.tags.map((tag) => `<a data-link href="/the-loai/${tag.slug}">${escapeHtml(tag.name)} <small>${tag.seriesCount}</small></a>`).join('') : '<span class="muted">Chưa có tag.</span>'}</div>
            </section>
          </div>
          <aside class="popular-sidebar">
            <section class="search-panel" id="search">
              <div class="search-box">
                ${icon.search}
                <input data-search-input placeholder="Tìm kiếm" value="${escapeAttr(state.searchQuery)}" />
              </div>
            </section>
            ${renderPopularSidebar(popular.slice(0, 10))}
          </aside>
        </section>
      </main>
    `;

    app.querySelector('[data-search-input]').addEventListener('input', throttle((event) => {
      state.searchQuery = event.target.value.trim();
      renderHome().then(() => reportVisibleAdSlots());
    }, 350));
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
