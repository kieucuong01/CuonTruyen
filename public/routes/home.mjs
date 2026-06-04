export const STATIC_INFO_PAGES = {
  '/gioi-thieu': {
    title: 'Giới thiệu Cuộn Truyện',
    body: 'Cuộn Truyện tập trung vào trải nghiệm đọc truyện tranh online mượt, nối chapter liên tục và tự lưu vị trí đang đọc trên trình duyệt.',
    items: [
      'Đọc liền mạch nhiều chapter mà không phải bấm chuyển trang.',
      'Tự lưu lịch sử, danh sách theo dõi và vị trí đọc trên trình duyệt.',
      'Chỉ hiển thị nội dung đã được quản trị viên publish ra public.'
    ]
  },
  '/lien-he': {
    title: 'Liên hệ',
    body: 'Báo lỗi truyện, góp ý trải nghiệm đọc hoặc gửi yêu cầu xử lý nội dung để quản trị viên kiểm tra và ẩn nội dung khi cần.',
    items: [
      'Ghi rõ tên truyện, chapter và lỗi bạn gặp để đội vận hành kiểm tra nhanh hơn.',
      'Với yêu cầu gỡ bỏ nội dung, hãy gửi kèm đường dẫn và bằng chứng quyền sở hữu hợp lệ.',
      'Các nội dung vi phạm có thể được chuyển sang trạng thái removed và biến mất khỏi public/sitemap.'
    ]
  },
  '/chinh-sach-noi-dung': {
    title: 'Chính sách nội dung',
    body: 'Quản trị viên có thể ẩn truyện hoặc chapter khỏi trang public và sitemap. Chỉ vận hành nguồn nội dung mà chủ sở hữu được phép sử dụng.',
    items: [
      'Nội dung mới sau khi crawl mặc định ở trạng thái draft để chờ review.',
      'Draft và removed không xuất hiện ở trang public, reader, search, tag hoặc sitemap.',
      'Takedown hợp lệ được xử lý bằng cách ẩn truyện/chapter thay vì xóa dữ liệu vận hành ngay lập tức.'
    ]
  },
  '/privacy': {
    title: 'Privacy',
    body: 'Lịch sử đọc, danh sách theo dõi và vị trí đọc được lưu trên trình duyệt. Sự kiện đọc được dùng để cải thiện trải nghiệm sản phẩm.',
    items: [
      'Tiến độ đọc và danh sách theo dõi dùng localStorage theo từng trình duyệt.',
      'Khi đăng nhập, phiên đọc có token server-issued để đồng bộ các thao tác tài khoản.',
      'Sự kiện như lượt xem, click donate hoặc độ sâu đọc chỉ dùng để cải thiện sản phẩm.'
    ]
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
  loadUserSession,
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
  userHeaders,
  uniqueSeriesById
}) {
  let desktopFeatureAutoplayTimer = null;

  async function renderHome() {
    stopReaderRuntime();
    clearDesktopFeatureAutoplay();
    const [home, bulletinMessages] = await Promise.all([
      loadHome(),
      loadBulletinMessages()
    ]);
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
    const mobileGenreSource = uniqueSeriesById([...updated, ...popular, ...homeSeries]);
    const manhwaSeries = pickGenreSeries(mobileGenreSource, 'manhwa').slice(0, 9);
    const manhuaSeries = pickGenreSeries(mobileGenreSource, 'manhua').slice(0, 9);

    app.innerHTML = `
      <main class="site-shell home-shell app-home-shell">
        ${renderTopbar()}
        ${renderDesktopComicPortal({ popular, updated, readingSeries, lastSeries, bulletinMessages })}
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
          <a href="#/following"><strong>Theo dõi</strong><span>Danh sách lưu local</span></a>
        </section>
        <section class="app-home-feed">
          ${renderContinueShelf(readingSeries, lastSeries)}
          ${state.searchQuery ? renderRail('Kết quả tìm kiếm', results, 'compact app-search-results') : ''}
          ${renderTrendingSection(popular.slice(0, 8))}
          <div class="desktop-updated-feed">
            ${renderUpdatedSection(updated)}
          </div>
          <div class="mobile-series-stack" aria-label="Danh sách truyện mobile">
            ${renderMobileSeriesShowcase({
              title: 'Mới cập nhật',
              eyebrow: 'Chapter mới',
              seriesList: updated.slice(0, 9)
            })}
            ${renderMobileSeriesShowcase({
              title: 'TRUYỆN MANHWA',
              eyebrow: 'Hàn Quốc',
              seriesList: manhwaSeries,
              moreHref: '/the-loai/manhwa'
            })}
            ${renderMobileSeriesShowcase({
              title: 'TRUYỆN MANHUA',
              eyebrow: 'Trung Quốc',
              seriesList: manhuaSeries,
              moreHref: '/the-loai/manhua'
            })}
          </div>
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
    bindDesktopFeatureSlider();
    bindDesktopCommunity();
    sendEvent('pageview', {});
    reportVisibleAdSlots();
  }

  async function loadBulletinMessages() {
    try {
      const payload = await fetchJson('/api/bulletin/messages?limit=20');
      return Array.isArray(payload.messages) ? payload.messages : [];
    } catch {
      return [];
    }
  }

  function renderDesktopComicPortal({ popular = [], updated = [], readingSeries = [], lastSeries = null, bulletinMessages = [] } = {}) {
    const featureSlides = uniqueSeriesById([lastSeries, ...popular, ...updated].filter(Boolean)).slice(0, 8);
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
            <p class="eyebrow">Cuộn Truyện</p>
            <h2>Đọc truyện tranh manga, manhwa, manhua online</h2>
          </div>
          <div class="desktop-portal-search" id="desktop-search">
            ${icon.search}
            <input data-search-input placeholder="Tìm kiếm truyện..." value="${escapeAttr(state.searchQuery)}" />
          </div>
        </div>
        <div class="desktop-portal-grid">
          <div class="desktop-portal-main">
            ${renderDesktopFeature(featureSlides, stats)}
            ${renderDesktopCommunity(bulletinMessages, latest, loadUserSession())}
          </div>
          ${renderDesktopRankBoard(rankItems)}
        </div>
      </section>
    `;
  }

  function renderDesktopFeature(slides = [], stats = []) {
    if (!slides.length) {
      return `
        <section class="desktop-feature empty-state">
          <h3>Chưa có truyện public</h3>
          <p>Hãy crawl và publish truyện trong admin để hiển thị khu nổi bật.</p>
        </section>
      `;
    }
    return `
      <section class="desktop-feature" data-desktop-feature-slider>
        <div class="desktop-feature-slides">
          ${slides.map((series, index) => renderDesktopFeatureSlide(series, { active: index === 0 })).join('')}
        </div>
        <div class="desktop-feature-dots" aria-label="Chọn truyện nổi bật">
          ${slides.map((series, index) => `<button type="button" data-feature-dot="${index}" class="${index === 0 ? 'active' : ''}" aria-label="${escapeAttr(`Xem ${series.title}`)}"></button>`).join('')}
        </div>
        <div class="desktop-feature-stats">
          ${stats.map((item) => `<span><strong>${item.value}</strong><small>${escapeHtml(item.label)}</small></span>`).join('')}
        </div>
      </section>
    `;
  }

  function renderDesktopFeatureSlide(featured, { active = false } = {}) {
    const chapters = (featured.chapters || []).filter((chapter) => chapter.imported || chapter.pageCount > 0);
    const firstChapter = chapters[0];
    const cover = coverUrl(featured);
    return `
      <article class="desktop-feature-slide ${active ? 'is-active' : ''}" data-feature-slide aria-hidden="${active ? 'false' : 'true'}">
        <a class="desktop-feature-copy" data-link href="/truyen/${escapeAttr(featured.slug)}">
          <span class="feature-star">${Math.max(1, Math.min(9, chapters.length || 5))}</span>
          <div>
            <h3>${escapeHtml(featured.title)}</h3>
            <p class="feature-tags">${renderInlineTags(featured)}</p>
            <strong>SUMMARY</strong>
            <p>${escapeHtml(featured.description || 'Đọc liền mạch, tự lưu vị trí và mở lại đúng chương đang đọc trên Cuộn Truyện.')}</p>
            <small>Trạng thái: ${escapeHtml(featured.status === 'public' ? 'Đang phát hành' : 'Đang cập nhật')}</small>
          </div>
        </a>
        <a class="desktop-feature-cover" data-link href="${firstChapter ? `/truyen/${escapeAttr(featured.slug)}/${escapeAttr(firstChapter.slug || firstChapter.id)}` : `/truyen/${escapeAttr(featured.slug)}`}">
          ${cover ? `<img src="${escapeAttr(cover)}" alt="${escapeAttr(featured.title)}" loading="${active ? 'eager' : 'lazy'}" />` : '<span>Cuộn Truyện</span>'}
        </a>
      </article>
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

  function renderDesktopCommunity(messages = [], latest = [], user = null) {
    const fallbackMessages = latest.map((series) => ({
      id: `latest-${series.id}`,
      authorName: 'Mới cập nhật',
      authorRole: 'system',
      text: `${series.title} vừa có trong danh sách cập nhật.`,
      createdAt: series.updatedAt || new Date().toISOString(),
      pinned: false
    }));
    const visibleMessages = messages.length ? messages : fallbackMessages.slice(0, 4);
    return `
      <section class="desktop-community">
        <div class="desktop-community-head">
          <h3>Bảng tin Cuộn Truyện</h3>
          <span>Chat chung của độc giả đã đăng nhập</span>
        </div>
        <div class="desktop-community-list">
          ${visibleMessages.length ? visibleMessages.map((item) => `
            <article class="${item.pinned ? 'is-pinned' : ''}">
              <span class="avatar">${escapeHtml((item.authorName || 'R').slice(0, 1))}</span>
              <p><strong>${escapeHtml(item.authorName || 'Reader')}</strong>${renderBulletinBadge(item)}<small>${escapeHtml(formatBulletinTime(item.createdAt))}</small><br>${escapeHtml(item.text)}</p>
            </article>
          `).join('') : '<p class="desktop-community-empty">Chưa có tin nhắn. Hãy là người mở lời đầu tiên.</p>'}
        </div>
        ${user ? `
          <form class="desktop-community-form" data-bulletin-form>
            <input name="text" maxlength="500" autocomplete="off" placeholder="Nhập tin nhắn cho bảng tin..." />
            <button class="primary-btn" type="submit">Gửi</button>
          </form>
          <p class="desktop-community-status" data-bulletin-status></p>
        ` : `
          <div class="desktop-community-login">
            <span>Đăng nhập để chat cùng mọi người.</span>
            <a class="ghost-btn" data-link href="#/login">Đăng nhập</a>
          </div>
        `}
      </section>
    `;
  }

  function bindDesktopFeatureSlider() {
    const slider = app.querySelector('[data-desktop-feature-slider]');
    if (!slider) return;
    const slides = [...slider.querySelectorAll('[data-feature-slide]')];
    const dots = [...slider.querySelectorAll('[data-feature-dot]')];
    if (slides.length < 2) return;
    let currentIndex = Math.max(0, slides.findIndex((slide) => slide.classList.contains('is-active')));
    const activate = (nextIndex) => {
      currentIndex = (nextIndex + slides.length) % slides.length;
      slides.forEach((slide, index) => {
        const active = index === currentIndex;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
      dots.forEach((dot, index) => dot.classList.toggle('active', index === currentIndex));
    };
    dots.forEach((dot, index) => dot.addEventListener('click', () => activate(index)));
    const prefersReducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;
    desktopFeatureAutoplayTimer = setInterval(() => {
      if (!document.body.contains(slider)) {
        clearDesktopFeatureAutoplay();
        return;
      }
      activate(currentIndex + 1);
    }, 4500);
  }

  function clearDesktopFeatureAutoplay() {
    if (!desktopFeatureAutoplayTimer) return;
    clearInterval(desktopFeatureAutoplayTimer);
    desktopFeatureAutoplayTimer = null;
  }

  function bindDesktopCommunity() {
    const form = app.querySelector('[data-bulletin-form]');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = app.querySelector('[data-bulletin-status]');
      const input = form.elements.text;
      const button = form.querySelector('button[type="submit"]');
      const text = input.value.trim();
      if (!text) return;
      button.disabled = true;
      if (status) status.textContent = 'Đang gửi...';
      try {
        await fetchJson('/api/bulletin/messages', {
          method: 'POST',
          headers: userHeaders(),
          body: JSON.stringify({ text })
        });
        input.value = '';
        await renderHome();
      } catch (error) {
        if (status) status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  }

  function renderBulletinBadge(item = {}) {
    if (item.pinned) return '<mark>GHIM</mark>';
    if (item.authorRole === 'admin') return '<mark>ADMIN</mark>';
    return '';
  }

  function formatBulletinTime(value = '') {
    const time = Date.parse(value);
    if (!time) return 'vừa xong';
    const diff = Date.now() - time;
    if (diff < 60_000) return 'vừa xong';
    if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))} phút trước`;
    if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))} giờ trước`;
    return new Date(time).toLocaleDateString('vi-VN');
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

  function renderMobileSeriesShowcase({ title, eyebrow, seriesList = [], moreHref = '' } = {}) {
    return `
      <section class="mobile-series-showcase">
        <div class="mobile-series-showcase-head">
          <div>
            ${eyebrow ? `<p>${escapeHtml(eyebrow)}</p>` : ''}
            <h2>${escapeHtml(title)}</h2>
          </div>
          ${moreHref ? `<a data-link href="${escapeAttr(moreHref)}">Xem thêm</a>` : ''}
        </div>
        <div class="mobile-series-mini-grid">
          ${seriesList.length ? seriesList.map((series) => renderMobileMiniCard(series)).join('') : '<p class="empty-state">Chưa có truyện trong mục này.</p>'}
        </div>
      </section>
    `;
  }

  function renderMobileMiniCard(series = {}) {
    const cover = coverUrl(series);
    const latestChapter = (series.chapters || []).find((chapter) => chapter.imported || chapter.pageCount > 0);
    const meta = latestChapter?.label || `${Number(series.chapterCount || series.chapters?.length || 0)} chương`;
    return `
      <a class="mobile-series-mini-card" data-link href="/truyen/${escapeAttr(series.slug)}">
        <span class="mobile-series-mini-cover">
          ${cover ? `<img src="${escapeAttr(cover)}" alt="${escapeAttr(series.title)}" loading="lazy" />` : '<span>CT</span>'}
        </span>
        <strong>${escapeHtml(series.title)}</strong>
        <small>${escapeHtml(meta)}</small>
      </a>
    `;
  }

  function pickGenreSeries(seriesList = [], genreSlug = '') {
    const wanted = normalizeTag(genreSlug);
    return seriesList.filter((series) => (series.tags || []).some((tag) => {
      const value = typeof tag === 'string' ? tag : `${tag.slug || ''} ${tag.name || ''}`;
      return normalizeTag(value).includes(wanted);
    }));
  }

  function normalizeTag(value = '') {
    return String(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-');
  }

  function renderStaticInfoPage(pathname) {
    stopReaderRuntime();
    const page = STATIC_INFO_PAGES[pathname];
    app.innerHTML = `
      <main class="site-shell static-page">
        ${renderTopbar()}
        <section class="page-heading static-page-heading">
          <h1>${escapeHtml(page.title)}</h1>
          <p>${escapeHtml(page.body)}</p>
        </section>
        <section class="static-info-panel">
          <ul>
            ${(page.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>
          <div class="static-info-actions">
            <a class="primary-btn inline-action" data-link href="/">Về trang chủ</a>
            <a class="ghost-btn inline-action" data-link href="#/search">Tìm truyện</a>
          </div>
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


