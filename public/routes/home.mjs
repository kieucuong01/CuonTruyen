export const STATIC_INFO_PAGES = {
  '/gioi-thieu': {
    title: 'Gi?i thi?u Cu?n Truy?n',
    body: 'Cu?n Truy?n t?p trung v?o tr?i nghi?m ??c truy?n tranh online m??t, n?i chapter li?n t?c v? t? l?u v? tr? ?ang ??c tr?n tr?nh duy?t.'
  },
  '/lien-he': {
    title: 'Li?n h?',
    body: 'B?o l?i truy?n, g?p ? tr?i nghi?m ??c ho?c g?i y?u c?u x? l? n?i dung ?? qu?n tr? vi?n ki?m tra v? ?n n?i dung khi c?n.'
  },
  '/chinh-sach-noi-dung': {
    title: 'Ch?nh s?ch n?i dung',
    body: 'Qu?n tr? vi?n c? th? ?n truy?n ho?c chapter kh?i trang public v? sitemap. Ch? v?n h?nh ngu?n n?i dung m? ch? s? h?u ???c ph?p s? d?ng.'
  },
  '/privacy': {
    title: 'Privacy',
    body: 'L?ch s? ??c, danh s?ch theo d?i v? v? tr? ??c ???c l?u tr?n tr?nh duy?t. S? ki?n ??c ???c d?ng ?? c?i thi?n tr?i nghi?m s?n ph?m.'
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
        ${renderDesktopComicPortal({ popular, updated, readingSeries, lastSeries })}
        <section class="app-home-hero">
          <div class="app-home-hero-copy">
            <p class="eyebrow">Cuốn Truyện</p>
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

  function renderDesktopComicPortal({ popular = [], updated = [], readingSeries = [], lastSeries = null } = {}) {
    const featured = lastSeries || popular[0] || updated[0];
    const weeklyHot = popular[1] || updated[1] || featured;
    const rankItems = uniqueSeriesById([...popular, ...updated]).slice(0, 6);
    const latest = updated.slice(0, 4);
    const stats = [
      { value: popular.length || 0, label: 'đề cử hot' },
      { value: updated.length || 0, label: 'vừa cập nhật' },
      { value: readingSeries.length || 0, label: 'đang đọc' }
    ];
    return `
      <section class="desktop-comic-portal" aria-label="Trang chủ truyện tranh desktop">
        <div class="desktop-portal-heading">
          <div>
            <p class="eyebrow">Cuốn Truyện</p>
            <h2>Đọc truyện tranh manga, manhwa, manhua online</h2>
          </div>
          <div class="desktop-portal-search" id="desktop-search">
            ${icon.search}
            <input data-search-input placeholder="Tìm kiếm truyện..." value="${escapeAttr(state.searchQuery)}" />
          </div>
        </div>
        <div class="desktop-portal-grid">
          <div class="desktop-portal-main">
            ${renderDesktopFeature(featured, weeklyHot, stats)}
            ${renderDesktopCommunity(latest)}
          </div>
          ${renderDesktopRankBoard(rankItems)}
        </div>
      </section>
    `;
  }

  function renderDesktopFeature(featured, weeklyHot, stats = []) {
    if (!featured) {
      return `
        <section class="desktop-feature empty-state">
          <h3>Chưa có truyện public</h3>
          <p>Hãy crawl và publish truyện trong admin để hiển thị khu nổi bật.</p>
        </section>
      `;
    }
    const chapters = (featured.chapters || []).filter((chapter) => chapter.imported || chapter.pageCount > 0);
    const firstChapter = chapters[0];
    const cover = coverUrl(featured);
    const hot = weeklyHot || featured;
    const hotCover = coverUrl(hot);
    return `
      <section class="desktop-feature">
        <a class="desktop-feature-copy" data-link href="/truyen/${escapeAttr(featured.slug)}">
          <span class="feature-star">${Math.max(1, Math.min(9, chapters.length || 5))}</span>
          <div>
            <h3>${escapeHtml(featured.title)}</h3>
            <p class="feature-tags">${renderInlineTags(featured)}</p>
            <strong>SUMMARY</strong>
            <p>${escapeHtml(featured.description || 'Đọc liền mạch, tự lưu vị trí và mở lại đúng chương đang đọc trên Cuốn Truyện.')}</p>
            <small>Trạng thái: ${escapeHtml(featured.status === 'public' ? 'Đang phát hành' : 'Đang cập nhật')}</small>
          </div>
        </a>
        <a class="desktop-feature-cover" data-link href="${firstChapter ? `/truyen/${escapeAttr(featured.slug)}/${escapeAttr(firstChapter.slug || firstChapter.id)}` : `/truyen/${escapeAttr(featured.slug)}`}">
          ${cover ? `<img src="${escapeAttr(cover)}" alt="${escapeAttr(featured.title)}" loading="eager" />` : '<span>Cuốn Truyện</span>'}
        </a>
        <a class="desktop-week-card" data-link href="/truyen/${escapeAttr(hot.slug)}">
          ${hotCover ? `<img src="${escapeAttr(hotCover)}" alt="" loading="lazy" />` : ''}
          <span class="crown">♛</span>
          <p>Truyện đang hot tuần này</p>
          <h3>${escapeHtml(hot.title)}</h3>
        </a>
        <div class="desktop-feature-dots" aria-hidden="true">
          ${Array.from({ length: 8 }, (_, index) => `<span class="${index === 5 ? 'active' : ''}"></span>`).join('')}
        </div>
        <div class="desktop-feature-stats">
          ${stats.map((item) => `<span><strong>${item.value}</strong><small>${escapeHtml(item.label)}</small></span>`).join('')}
        </div>
      </section>
    `;
  }

  function renderDesktopRankBoard(items = []) {
    return `
      <aside class="desktop-rank-board" aria-label="Truyện phổ biến">
        <div class="desktop-rank-head">
          <h3>Truyện phổ biến</h3>
          <div><button type="button">Tuần</button><button type="button">Tháng</button><button type="button">Tất cả</button></div>
        </div>
        <ol>
          ${items.length ? items.map((series, index) => `
            <li>
              <span class="rank-index">${index + 1}</span>
              <a class="rank-thumb" data-link href="/truyen/${escapeAttr(series.slug)}">
                ${coverUrl(series) ? `<img src="${escapeAttr(coverUrl(series))}" alt="" loading="lazy" />` : '<span>CT</span>'}
              </a>
              <a class="rank-copy" data-link href="/truyen/${escapeAttr(series.slug)}">
                <strong>${escapeHtml(series.title)}</strong>
                <small>Thể loại: ${renderInlineTags(series) || 'Đang cập nhật'}</small>
                <em>★★★★★ <span>${ratingFor(series, index)}</span></em>
              </a>
            </li>
          `).join('') : '<li class="empty-state">Chưa có truyện phổ biến.</li>'}
        </ol>
      </aside>
    `;
  }

  function renderDesktopCommunity(latest = []) {
    const messages = [
      {
        name: 'Admin',
        badge: 'ADMIN',
        text: 'Chapter mới sẽ được đồng bộ sau khi crawl local xong. Nếu thấy ảnh lỗi, báo để mình xử lý nhanh.'
      },
      {
        name: 'Đội Cuốn Truyện',
        badge: 'BOT',
        text: 'Ưu tiên trải nghiệm đọc mượt, ít làm phiền, mở lại đúng vị trí đang đọc.'
      },
      ...latest.map((series) => ({
        name: 'Mới cập nhật',
        badge: '',
        text: `${series.title} vừa có trong danh sách cập nhật.`
      }))
    ].slice(0, 6);
    return `
      <section class="desktop-community">
        <div class="desktop-community-head">
          <h3>Bảng tin Cuốn Truyện</h3>
          <span>Cập nhật nhanh cho độc giả</span>
        </div>
        <div class="desktop-community-list">
          ${messages.map((item, index) => `
            <article>
              <span class="avatar">${escapeHtml(item.name.slice(0, 1))}</span>
              <p><strong>${escapeHtml(item.name)}</strong>${item.badge ? `<mark>${escapeHtml(item.badge)}</mark>` : ''}<small>${index ? `${index + 1} giờ trước` : 'vừa xong'}</small><br>${escapeHtml(item.text)}</p>
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }

  function coverUrl(series = {}) {
    return series.thumbnailUrl || series.coverThumbnailUrl || series.coverUrl || series.imageUrl || '';
  }

  function renderInlineTags(series = {}) {
    return (series.tags || [])
      .slice(0, 3)
      .map((tag) => escapeHtml(tag.name || tag.slug || tag))
      .join(', ');
  }

  function ratingFor(series = {}, index = 0) {
    const base = 5 - (index * 0.06);
    const views = Number(series.stats?.views || 0);
    return Math.max(4.3, Math.min(5, base + Math.min(0.08, views / 100000))).toFixed(index ? 2 : 0);
  }
  function renderStaticInfoPage(pathname) {
    stopReaderRuntime();
    const page = STATIC_INFO_PAGES[pathname];
    app.innerHTML = `
      <main class="site-shell static-page">
        ${renderTopbar()}
        ${renderDesktopComicPortal({ popular, updated, readingSeries, lastSeries })}
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


