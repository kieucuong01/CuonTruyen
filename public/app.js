import {
  createProgressSnapshot,
  loadLastSeriesId,
  loadProgress,
  saveProgress
} from './readingProgress.mjs';

const app = document.querySelector('#app');
const state = {
  catalog: { series: [] },
  home: { hot: [], updated: [], tags: [] },
  series: null,
  loadedChapterCount: 0,
  currentChapterId: '',
  drawerOpen: false,
  saving: false,
  searchQuery: ''
};

const icon = {
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  menu: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="2"/><path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1a2.1 2.1 0 0 1-3 3l-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1.1 1.7V21a2.1 2.1 0 0 1-4.2 0v-.2a1.8 1.8 0 0 0-1.2-1.7 1.8 1.8 0 0 0-2 .4l-.1.1a2.1 2.1 0 1 1-3-3l.1-.1a1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.7-1.1H2a2.1 2.1 0 0 1 0-4.2h.2a1.8 1.8 0 0 0 1.7-1.2 1.8 1.8 0 0 0-.4-2l-.1-.1a2.1 2.1 0 1 1 3-3l.1.1a1.8 1.8 0 0 0 2 .4h.1a1.8 1.8 0 0 0 1-1.7V2a2.1 2.1 0 0 1 4.2 0v.2a1.8 1.8 0 0 0 1.1 1.7 1.8 1.8 0 0 0 2-.4l.1-.1a2.1 2.1 0 1 1 3 3l-.1.1a1.8 1.8 0 0 0-.4 2v.1a1.8 1.8 0 0 0 1.7 1h.2a2.1 2.1 0 0 1 0 4.2h-.2a1.8 1.8 0 0 0-1.8 1.2Z" stroke="currentColor" stroke-width="2"/></svg>'
};

window.addEventListener('hashchange', route);
window.addEventListener('popstate', route);

document.addEventListener('click', (event) => {
  const link = event.target.closest('[data-link]');
  if (!link) return;
  event.preventDefault();
  history.pushState({}, '', link.getAttribute('href'));
  route();
});

route();

async function route() {
  const readMatch = location.hash.match(/^#\/read\/([^/]+)/);
  if (readMatch) {
    await renderReader(decodeURIComponent(readMatch[1]));
    return;
  }
  if (location.hash === '#/admin') {
    await renderAdmin();
    return;
  }

  const chapterMatch = location.pathname.match(/^\/truyen\/([^/]+)\/([^/]+)$/);
  if (chapterMatch) {
    await renderReaderFromSlug(decodeURIComponent(chapterMatch[1]), decodeURIComponent(chapterMatch[2]));
    return;
  }

  const seriesMatch = location.pathname.match(/^\/truyen\/([^/]+)$/);
  if (seriesMatch) {
    await renderSeriesDetail(decodeURIComponent(seriesMatch[1]));
    return;
  }

  const tagMatch = location.pathname.match(/^\/the-loai\/([^/]+)$/);
  if (tagMatch) {
    await renderTagPage(decodeURIComponent(tagMatch[1]));
    return;
  }

  await renderHome();
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

async function loadCatalog() {
  state.catalog = await fetchJson('/api/series');
  return state.catalog;
}

async function loadHome() {
  state.home = await fetchJson('/api/public/home');
  return state.home;
}

async function renderHome() {
  const [catalog, home] = await Promise.all([loadCatalog(), loadHome()]);
  const lastSeriesId = loadLastSeriesId();
  const lastSeries = catalog.series.find((series) => series.id === lastSeriesId);
  const lastProgress = lastSeries ? loadProgress(lastSeries.id) : null;
  const results = state.searchQuery
    ? await fetchJson(`/api/search?q=${encodeURIComponent(state.searchQuery)}`).then((data) => data.series)
    : [];

  app.innerHTML = `
    <main class="site-shell">
      ${renderTopbar()}
      <section class="discovery-band">
        <div class="search-box">
          ${icon.search}
          <input data-search-input placeholder="Tìm truyện, alias hoặc tag..." value="${escapeAttr(state.searchQuery)}" />
        </div>
        ${lastSeries ? `
          <section class="continue-card">
            <div>
              <strong>Đọc tiếp: ${escapeHtml(lastSeries.title)}</strong>
              <span>${lastProgress ? `${lastProgress.progressPercent}% - ${escapeHtml(lastProgress.chapterId)}` : 'Có truyện đã import gần đây'}</span>
            </div>
            <button class="primary-btn" data-read="${lastSeries.id}">Đọc tiếp</button>
          </section>
        ` : ''}
      </section>

      ${state.searchQuery ? renderRail(`Kết quả tìm kiếm`, results) : ''}
      ${renderRail('Truyện hot', home.hot)}
      ${renderRail('Mới cập nhật', home.updated)}
      <section class="tag-cloud">
        <h2 class="section-title">Tag nổi bật</h2>
        <div>${home.tags.length ? home.tags.map((tag) => `<a data-link href="/the-loai/${tag.slug}">${escapeHtml(tag.name)} <small>${tag.seriesCount}</small></a>`).join('') : '<span class="muted">Chưa có tag.</span>'}</div>
      </section>
      <section class="ad-slot" data-ad-slot="home">AdSense responsive slot</section>
    </main>
  `;

  app.querySelector('[data-search-input]').addEventListener('input', throttle((event) => {
    state.searchQuery = event.target.value.trim();
    renderHome();
  }, 350));
  bindReadButtons();
  sendEvent('pageview', {});
}

function renderTopbar() {
  return `
    <header class="topbar">
      <a class="brand" data-link href="/">
        <div class="brand-mark">KS</div>
        <div>
          <h1>K-Scroll Reader</h1>
          <p>Manhua, manhwa tiếng Việt, đọc liên tục và lưu vị trí.</p>
        </div>
      </a>
      <div class="top-actions">
        <a class="ghost-btn" href="#/admin">${icon.settings}<span>Admin</span></a>
      </div>
    </header>
  `;
}

function renderRail(title, seriesList) {
  return `
    <section class="content-rail">
      <h2 class="section-title">${escapeHtml(title)}</h2>
      <div class="series-grid">
        ${seriesList.length ? seriesList.map(renderSeriesCard).join('') : '<div class="empty-state">Chưa có truyện phù hợp.</div>'}
      </div>
    </section>
  `;
}

function renderSeriesCard(series) {
  const imported = series.chapters.filter((chapter) => chapter.pages?.length || chapter.imported).length;
  const pages = series.chapters.reduce((sum, chapter) => sum + Number(chapter.pageCount || chapter.pages?.length || 0), 0);
  return `
    <article class="series-card">
      <a class="series-cover" data-link href="/truyen/${series.slug}">
        ${series.coverUrl ? `<img loading="lazy" src="${escapeAttr(series.coverUrl)}" alt="${escapeAttr(series.title)}">` : '<span>No cover</span>'}
      </a>
      <div class="series-card-copy">
        <h3><a data-link href="/truyen/${series.slug}">${escapeHtml(series.title)}</a></h3>
        <p>${imported}/${series.chapters.length} chapter, ${pages} ảnh cache.</p>
        <div class="tag-row">${(series.tags || []).slice(0, 3).map((tag) => `<a data-link href="/the-loai/${tag.slug}">${escapeHtml(tag.name)}</a>`).join('')}</div>
      </div>
      <div class="card-actions">
        <button class="primary-btn" data-read="${series.id}">Đọc</button>
        <a class="ghost-btn" data-link href="/truyen/${series.slug}">Chi tiết</a>
      </div>
    </article>
  `;
}

async function renderSeriesDetail(slug) {
  const series = await fetchJson(`/api/series/${encodeURIComponent(slug)}`);
  sendEvent('pageview', { seriesSlug: series.slug });
  const imported = series.chapters.filter((chapter) => chapter.pages?.length || chapter.imported);
  app.innerHTML = `
    <main class="site-shell">
      ${renderTopbar()}
      <section class="series-detail">
        <div class="detail-cover">${series.coverUrl ? `<img src="${escapeAttr(series.coverUrl)}" alt="${escapeAttr(series.title)}">` : '<span>No cover</span>'}</div>
        <div class="detail-copy">
          <div class="tag-row">${(series.tags || []).map((tag) => `<a data-link href="/the-loai/${tag.slug}">${escapeHtml(tag.name)}</a>`).join('')}</div>
          <h2>${escapeHtml(series.title)}</h2>
          <p>${escapeHtml(series.description || 'Truyện đã cache về hệ thống, sẵn sàng đọc liên tục và lưu vị trí trên trình duyệt.')}</p>
          <div class="metric-strip">
            <span>${series.stats?.views || 0} views</span>
            <span>${imported.length}/${series.chapters.length} chapter public</span>
            <span>${series.stats?.readDepth || 0}% read depth</span>
          </div>
          <div class="detail-actions">
            <button class="primary-btn" data-read="${series.id}">Đọc ngay</button>
            ${imported[0] ? `<a class="ghost-btn" data-link href="/truyen/${series.slug}/${imported[0].slug}">Chapter đầu</a>` : ''}
          </div>
        </div>
      </section>
      <section class="chapter-panel">
        <h2 class="section-title">Danh sách chapter</h2>
        <div class="chapter-list-inline">
          ${series.chapters.map((chapter) => `
            <a data-link href="/truyen/${series.slug}/${chapter.slug}" class="${chapter.pages?.length ? '' : 'disabled'}">
              <span>${escapeHtml(chapter.title || chapter.label)}</span>
              <small>${chapter.pageCount || chapter.pages?.length || 0} ảnh</small>
            </a>
          `).join('')}
        </div>
      </section>
    </main>
  `;
  bindReadButtons();
}

async function renderTagPage(tagSlug) {
  const page = await fetchJson(`/api/tags/${encodeURIComponent(tagSlug)}`);
  app.innerHTML = `
    <main class="site-shell">
      ${renderTopbar()}
      <section class="page-heading">
        <h2>Truyện ${escapeHtml(page.tag.name)}</h2>
        <p>${page.series.length} bộ truyện đang public.</p>
      </section>
      ${renderRail(`Danh sách ${page.tag.name}`, page.series)}
    </main>
  `;
  bindReadButtons();
  sendEvent('pageview', {});
}

async function renderAdmin() {
  const catalog = await loadCatalog();
  app.innerHTML = `
    <main class="site-shell admin-shell">
      ${renderTopbar()}
      <section class="admin-grid">
        <form class="import-panel admin-panel" data-import-form>
          <h2>Crawl truyện</h2>
          <input name="url" required placeholder="Dán URL truyện..." value="https://truyenqqko.com/truyen-tranh/manh-nhat-lich-su-5968" />
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
        <div class="status-line" data-status></div>
      </section>
      <section class="admin-list">
        <h2 class="section-title">CMS truyện</h2>
        ${catalog.series.length ? catalog.series.map(renderAdminSeriesForm).join('') : '<div class="empty-state">Chưa có truyện để quản lý.</div>'}
      </section>
    </main>
  `;
  app.querySelector('[data-import-form]').addEventListener('submit', handleImport);
  app.querySelectorAll('[data-admin-series]').forEach((form) => form.addEventListener('submit', handleAdminSave));
}

function renderAdminSeriesForm(series) {
  return `
    <form class="admin-series-card" data-admin-series="${series.id}">
      <div>
        <strong>${escapeHtml(series.title)}</strong>
        <span>${escapeHtml(series.sourceMappings?.[0]?.sourceUrl || series.sourceUrl || '')}</span>
      </div>
      <input name="title" value="${escapeAttr(series.title)}" aria-label="Tên truyện" />
      <input name="slug" value="${escapeAttr(series.slug)}" aria-label="Slug" />
      <input name="aliases" value="${escapeAttr((series.aliases || []).join(', '))}" aria-label="Alias" placeholder="Alias, cách nhau bằng dấu phẩy" />
      <input name="tags" value="${escapeAttr((series.tags || []).map((tag) => tag.name || tag).join(', '))}" aria-label="Tags" placeholder="Tags" />
      <textarea name="description" aria-label="Mô tả" placeholder="Mô tả SEO">${escapeHtml(series.description || '')}</textarea>
      <select name="status" aria-label="Trạng thái">
        <option value="public" ${series.status === 'public' ? 'selected' : ''}>Public</option>
        <option value="draft" ${series.status === 'draft' ? 'selected' : ''}>Draft</option>
      </select>
      <label class="toggle-row"><input type="checkbox" name="scheduleEnabled" ${series.crawlSchedule?.enabled ? 'checked' : ''}> Crawl định kỳ</label>
      <input name="intervalHours" type="number" min="1" value="${escapeAttr(series.crawlSchedule?.intervalHours || 24)}" aria-label="Chu kỳ giờ" />
      <button class="primary-btn" type="submit">Lưu CMS</button>
    </form>
  `;
}

async function handleAdminSave(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const payload = {
    title: formData.get('title'),
    slug: formData.get('slug'),
    aliases: splitList(formData.get('aliases')),
    tags: splitList(formData.get('tags')),
    description: formData.get('description'),
    status: formData.get('status'),
    crawlSchedule: {
      enabled: formData.get('scheduleEnabled') === 'on',
      intervalHours: Number(formData.get('intervalHours') || 24)
    }
  };
  await fetchJson(`/api/admin/series/${encodeURIComponent(form.dataset.adminSeries)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const status = app.querySelector('[data-status]');
  if (status) status.textContent = 'Đã lưu CMS và lịch crawl.';
  await renderAdmin();
}

async function handleImport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = app.querySelector('[data-status]');
  const button = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  status.className = 'status-line';
  status.textContent = 'Đang tạo job crawl...';
  button.disabled = true;
  button.textContent = 'Đang crawl';

  try {
    const { job, reused } = await fetchJson('/api/admin/import-jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: formData.get('url'),
        maxChapters: Number(formData.get('maxChapters')),
        maxPages: Number(formData.get('maxPages'))
      })
    });
    if (reused) status.textContent = 'URL này đang có job chạy, đang theo dõi job cũ...';
    await pollImportJob(job.id, status);
  } catch (error) {
    status.className = 'status-line error';
    status.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Crawl';
  }
}

async function pollImportJob(jobId, status) {
  while (true) {
    const job = await fetchJson(`/api/admin/import-jobs/${encodeURIComponent(jobId)}`);
    renderImportProgress(status, job);
    if (job.status === 'completed') {
      await loadCatalog();
      await new Promise((resolve) => setTimeout(resolve, 650));
      location.hash = `#/read/${encodeURIComponent(job.series.id)}`;
      return job.series;
    }
    if (job.status === 'failed') throw new Error(job.error || job.progress?.message || 'Import thất bại.');
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
}

function renderImportProgress(status, job) {
  const progress = job.progress || {};
  const chapterTotal = Number(progress.totalChapters || 0);
  const chapterDone = Number(progress.processedChapters || 0);
  const imageTotal = Number(progress.totalImages || 0);
  const imageDone = Number(progress.downloadedImages || 0);
  const chapterPercent = chapterTotal ? chapterDone / chapterTotal : 0;
  const imagePercent = imageTotal ? imageDone / imageTotal : 0;
  const percent = Math.round((chapterPercent * 0.45 + imagePercent * 0.55) * 100);
  status.className = `status-line import-progress ${job.status === 'failed' ? 'error' : ''}`;
  status.innerHTML = `
    <div class="progress-copy">
      <strong>${escapeHtml(progress.message || 'Đang import...')}</strong>
      <span>${escapeHtml(progress.currentChapterLabel || progress.phase || '')}</span>
    </div>
    <div class="crawl-meter" aria-label="Tiến độ crawl">
      <div style="width:${Math.max(4, Math.min(100, percent))}%"></div>
    </div>
    <div class="progress-grid">
      <span>Phase: ${escapeHtml(progress.phase || job.status)}</span>
      <span>Chapter: ${chapterDone}/${chapterTotal || '?'}</span>
      <span>Ảnh: ${imageDone}/${imageTotal || '?'}</span>
      <span>Trạng thái: ${escapeHtml(job.status)}</span>
    </div>
  `;
}

async function renderReader(seriesId) {
  state.series = await fetchJson(`/api/series/${encodeURIComponent(seriesId)}`);
  prepareReader(loadProgress(state.series.id));
  drawReader();
  attachReaderObservers();
  restoreScroll(loadProgress(state.series.id));
  sendEvent('pageview', { seriesSlug: state.series.slug });
}

async function renderReaderFromSlug(seriesSlug, chapterSlug) {
  const { series, chapter } = await fetchJson(`/api/series/${encodeURIComponent(seriesSlug)}/chapters/${encodeURIComponent(chapterSlug)}`);
  state.series = series;
  prepareReader({ chapterId: chapter.id });
  ensureChapterLoaded(chapter.id);
  drawReader();
  attachReaderObservers();
  requestAnimationFrame(() => {
    document.querySelector(`[data-chapter-id="${CSS.escape(chapter.id)}"]`)?.scrollIntoView({ behavior: 'instant' });
  });
  sendEvent('pageview', { seriesSlug: state.series.slug, chapterSlug: chapter.slug });
}

function prepareReader(saved) {
  state.loadedChapterCount = Math.min(2, importedChapters().length || 1);
  state.currentChapterId = importedChapters()[0]?.id || state.series.chapters[0]?.id || '';
  state.drawerOpen = false;
  if (saved?.chapterId) state.currentChapterId = saved.chapterId;
}

function drawReader() {
  const chapters = importedChapters();
  const visibleChapters = chapters.slice(0, state.loadedChapterCount);
  app.innerHTML = `
    <main class="reader">
      <div class="progress-bar"></div>
      <header class="reader-toolbar">
        <button class="icon-btn" title="Quay lại" data-back>${icon.back}</button>
        <div class="reader-title">
          <strong>${escapeHtml(state.series.title)}</strong>
          <span data-current-label>${escapeHtml(currentChapter()?.label || 'Chưa có chapter')}</span>
        </div>
        <button class="ghost-btn" data-continue>Đọc tiếp</button>
        <button class="icon-btn" title="Danh sách chapter" data-open-drawer>${icon.menu}</button>
      </header>
      <section class="chapter-stream">
        ${visibleChapters.map(renderChapter).join('')}
        <div class="loader-row" data-load-more>${state.loadedChapterCount < chapters.length ? 'Đang nối chapter tiếp theo...' : 'Đã hết phần đã import'}</div>
      </section>
      <div data-drawer-root></div>
    </main>
  `;

  app.querySelector('[data-back]').addEventListener('click', () => {
    history.pushState({}, '', `/truyen/${state.series.slug}`);
    location.hash = '';
    route();
  });
  app.querySelector('[data-open-drawer]').addEventListener('click', () => {
    state.drawerOpen = true;
    renderDrawer();
  });
  app.querySelector('[data-continue]').addEventListener('click', () => {
    const progress = loadProgress(state.series.id);
    window.scrollTo({ top: progress?.scrollY || 0, behavior: 'smooth' });
  });
  renderDrawer();
}

function renderChapter(chapter, index) {
  return `
    <article class="chapter-block" data-chapter-id="${chapter.id}">
      ${index > 0 ? '<section class="ad-slot reader-ad" data-ad-slot="chapter-break">AdSense chapter break</section>' : ''}
      <div class="chapter-heading">${escapeHtml(chapter.label)}</div>
      ${chapter.pages.length ? chapter.pages.map((page) => `
        <img class="page-image" loading="lazy" decoding="async" data-page-index="${page.order}" src="${page.imageUrl}" alt="${escapeHtml(chapter.label)} trang ${Number(page.order) + 1}" />
      `).join('') : '<div class="page-missing">Chapter này chưa có ảnh trong cache. Crawl thêm để đọc tiếp.</div>'}
    </article>
  `;
}

function renderDrawer() {
  const root = app.querySelector('[data-drawer-root]');
  if (!root) return;
  if (!state.drawerOpen) {
    root.innerHTML = '';
    return;
  }
  const chapters = importedChapters();
  const progress = loadProgress(state.series.id);
  root.innerHTML = `
    <div class="drawer-backdrop" data-close-drawer></div>
    <aside class="chapter-drawer" aria-label="Danh sách chapter">
      <header class="drawer-header">
        <div>
          <strong>${escapeHtml(state.series.title)}</strong>
          <span>${progress ? `${progress.progressPercent}% đã đọc` : 'Chưa lưu tiến độ'}</span>
        </div>
        <button class="icon-btn" title="Đóng" data-close-drawer>${icon.close}</button>
      </header>
      <div class="chapter-list">
        ${chapters.map((chapter) => `
          <button class="chapter-item ${chapter.id === state.currentChapterId ? 'active' : ''}" data-jump="${chapter.id}">
            <span>${escapeHtml(chapter.label)}</span>
            <small>${chapter.pageCount} ảnh</small>
          </button>
        `).join('')}
      </div>
    </aside>
  `;
  root.querySelectorAll('[data-close-drawer]').forEach((node) => {
    node.addEventListener('click', () => {
      state.drawerOpen = false;
      renderDrawer();
    });
  });
  root.querySelectorAll('[data-jump]').forEach((button) => {
    button.addEventListener('click', () => {
      ensureChapterLoaded(button.dataset.jump);
      state.drawerOpen = false;
      drawReader();
      requestAnimationFrame(() => {
        document.querySelector(`[data-chapter-id="${CSS.escape(button.dataset.jump)}"]`)?.scrollIntoView({ behavior: 'smooth' });
      });
    });
  });
}

function attachReaderObservers() {
  const chapters = importedChapters();
  const chapterObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    state.currentChapterId = visible.target.dataset.chapterId;
    const label = app.querySelector('[data-current-label]');
    if (label) label.textContent = currentChapter()?.label || '';
    renderDrawer();
  }, { threshold: [0.25, 0.55] });

  document.querySelectorAll('[data-chapter-id]').forEach((chapter) => chapterObserver.observe(chapter));

  const loader = document.querySelector('[data-load-more]');
  const loadObserver = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    if (state.loadedChapterCount >= chapters.length) return;
    state.loadedChapterCount = Math.min(state.loadedChapterCount + 1, chapters.length);
    drawReader();
    attachReaderObservers();
  }, { rootMargin: '900px 0px' });
  if (loader) loadObserver.observe(loader);

  const adObserver = new IntersectionObserver((entries) => {
    entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
      if (entry.target.dataset.reported) return;
      entry.target.dataset.reported = 'true';
      sendEvent('ad_view', { seriesSlug: state.series.slug, chapterId: state.currentChapterId });
    });
  }, { threshold: 0.5 });
  document.querySelectorAll('[data-ad-slot]').forEach((slot) => adObserver.observe(slot));

  window.addEventListener('scroll', throttle(saveReaderProgress, 400), { passive: true });
  saveReaderProgress();
}

function saveReaderProgress() {
  if (!state.series || state.saving) return;
  const doc = document.documentElement;
  const progressPercent = (window.scrollY / Math.max(1, doc.scrollHeight - window.innerHeight)) * 100;
  const current = currentChapter();
  if (!current) return;
  const currentImage = document.elementFromPoint(window.innerWidth / 2, Math.min(window.innerHeight - 120, 360));
  const pageIndex = Number(currentImage?.dataset?.pageIndex || 0);
  saveProgress(createProgressSnapshot({
    seriesId: state.series.id,
    chapterId: current.id,
    pageIndex,
    scrollY: Math.round(window.scrollY),
    progressPercent
  }));
  sendReadDepth(progressPercent);
  document.documentElement.style.setProperty('--reader-progress', `${Math.max(2, Math.round(progressPercent))}%`);
}

const sendReadDepth = throttle((progressPercent) => {
  sendEvent('read_depth', {
    seriesSlug: state.series?.slug,
    chapterId: state.currentChapterId,
    value: Math.round(progressPercent)
  });
}, 5000);

function restoreScroll(saved) {
  if (saved?.scrollY) {
    setTimeout(() => window.scrollTo({ top: saved.scrollY, behavior: 'instant' }), 120);
  }
}

function bindReadButtons() {
  app.querySelectorAll('[data-read]').forEach((button) => {
    button.addEventListener('click', () => {
      location.hash = `#/read/${encodeURIComponent(button.dataset.read)}`;
    });
  });
}

function ensureChapterLoaded(chapterId) {
  const index = importedChapters().findIndex((chapter) => chapter.id === chapterId);
  if (index >= 0) state.loadedChapterCount = Math.max(state.loadedChapterCount, index + 1);
}

function importedChapters() {
  return (state.series?.chapters || []).filter((chapter) => chapter.pages?.length || chapter.imported);
}

function currentChapter() {
  return (state.series?.chapters || []).find((chapter) => chapter.id === state.currentChapterId) || importedChapters()[0];
}

function sendEvent(type, payload = {}) {
  const body = {
    type,
    url: location.href,
    at: new Date().toISOString(),
    ...payload
  };
  fetch('/api/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).catch(() => {});
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function throttle(fn, wait) {
  let last = 0;
  let timeout = null;
  return (...args) => {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      clearTimeout(timeout);
      timeout = null;
      last = now;
      fn(...args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        last = Date.now();
        timeout = null;
        fn(...args);
      }, remaining);
    }
  };
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value = '') {
  return escapeHtml(value);
}
