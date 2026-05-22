import {
  createProgressSnapshot,
  loadLastSeriesId,
  loadProgress,
  saveProgress
} from './readingProgress.mjs';

const app = document.querySelector('#app');
const state = {
  catalog: { series: [] },
  series: null,
  loadedChapterCount: 0,
  currentChapterId: '',
  drawerOpen: false,
  saving: false
};

const icon = {
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  menu: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
};

window.addEventListener('hashchange', route);

route();

async function route() {
  const match = location.hash.match(/^#\/read\/([^/]+)/);
  if (match) {
    await renderReader(decodeURIComponent(match[1]));
    return;
  }
  await renderLibrary();
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

async function renderLibrary() {
  const catalog = await loadCatalog();
  const lastSeriesId = loadLastSeriesId();
  const lastSeries = catalog.series.find((series) => series.id === lastSeriesId);
  const lastProgress = lastSeries ? loadProgress(lastSeries.id) : null;

  app.innerHTML = `
    <main class="library">
      <header class="topbar">
        <div class="brand">
          <div class="brand-mark">KS</div>
          <div>
            <h1>K-Scroll Reader</h1>
            <p>Import URL truyện, đọc liên tục, quay lại đúng vị trí.</p>
          </div>
        </div>
      </header>

      <form class="import-panel" data-import-form>
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
        <button class="primary-btn" type="submit">Import</button>
      </form>
      <div class="status-line" data-status></div>

      ${lastSeries ? `
        <section class="continue-card">
          <div>
            <strong>Đọc tiếp: ${escapeHtml(lastSeries.title)}</strong>
            <span>${lastProgress ? `${lastProgress.progressPercent}% - ${escapeHtml(lastProgress.chapterId)}` : 'Có truyện đã import gần đây'}</span>
          </div>
          <button class="primary-btn" data-read="${lastSeries.id}">Đọc tiếp</button>
        </section>
      ` : ''}

      <h2 class="section-title">Thư viện đã import</h2>
      <section class="series-grid">
        ${catalog.series.length ? catalog.series.map(renderSeriesCard).join('') : '<div class="empty-state">Chưa có truyện nào. Dán URL phía trên để bắt đầu.</div>'}
      </section>
    </main>
  `;

  app.querySelector('[data-import-form]').addEventListener('submit', handleImport);
  app.querySelectorAll('[data-read]').forEach((button) => {
    button.addEventListener('click', () => {
      location.hash = `#/read/${encodeURIComponent(button.dataset.read)}`;
    });
  });
}

function renderSeriesCard(series) {
  const imported = series.chapters.filter((chapter) => chapter.imported).length;
  const pages = series.chapters.reduce((sum, chapter) => sum + chapter.pageCount, 0);
  return `
    <article class="series-card">
      <h2>${escapeHtml(series.title)}</h2>
      <p>${imported}/${series.chapters.length} chapter đã cache, ${pages} ảnh.</p>
      <p>Nguồn: ${escapeHtml(new URL(series.sourceUrl).hostname)}</p>
      <div class="card-actions">
        <button class="primary-btn" data-read="${series.id}">Đọc</button>
        <button class="ghost-btn" data-read="${series.id}">Đọc tiếp</button>
      </div>
    </article>
  `;
}

async function handleImport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = app.querySelector('[data-status]');
  const button = form.querySelector('button');
  const formData = new FormData(form);
  status.className = 'status-line';
  status.textContent = 'Đang crawl metadata, chapter và ảnh. Lần đầu có thể mất một chút...';
  button.disabled = true;
  button.textContent = 'Đang import';

  try {
    const { job } = await fetchJson('/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: formData.get('url'),
        maxChapters: Number(formData.get('maxChapters')),
        maxPages: Number(formData.get('maxPages'))
      })
    });
    await pollImportJob(job.id, status);
  } catch (error) {
    status.className = 'status-line error';
    status.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Import';
  }
}

async function pollImportJob(jobId, status) {
  while (true) {
    const job = await fetchJson(`/api/import/${encodeURIComponent(jobId)}`);
    renderImportProgress(status, job);
    if (job.status === 'completed') {
      await loadCatalog();
      await new Promise((resolve) => setTimeout(resolve, 650));
      location.hash = `#/read/${encodeURIComponent(job.series.id)}`;
      return job.series;
    }
    if (job.status === 'failed') {
      throw new Error(job.error || job.progress?.message || 'Import thất bại.');
    }
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
      <span>Chapter: ${chapterDone}/${chapterTotal || '?'}</span>
      <span>Ảnh: ${imageDone}/${imageTotal || '?'}</span>
      <span>Trạng thái: ${escapeHtml(job.status)}</span>
    </div>
  `;
}

async function renderReader(seriesId) {
  state.series = await fetchJson(`/api/series/${encodeURIComponent(seriesId)}`);
  state.loadedChapterCount = Math.min(2, importedChapters().length || 1);
  state.currentChapterId = importedChapters()[0]?.id || state.series.chapters[0]?.id || '';
  state.drawerOpen = false;

  const saved = loadProgress(seriesId);
  if (saved?.chapterId) state.currentChapterId = saved.chapterId;

  drawReader();
  attachReaderObservers();
  if (saved?.scrollY) {
    setTimeout(() => window.scrollTo({ top: saved.scrollY, behavior: 'instant' }), 120);
  }
}

function drawReader() {
  const chapters = importedChapters();
  const visibleChapters = chapters.slice(0, state.loadedChapterCount);
  app.innerHTML = `
    <main class="reader">
      <div class="progress-bar"></div>
      <header class="reader-toolbar">
        <button class="icon-btn" title="Quay lại thư viện" data-back>${icon.back}</button>
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
    location.hash = '';
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

function renderChapter(chapter) {
  return `
    <article class="chapter-block" data-chapter-id="${chapter.id}">
      <div class="chapter-heading">${escapeHtml(chapter.label)}</div>
      ${chapter.pages.length ? chapter.pages.map((page) => `
        <img class="page-image" loading="lazy" decoding="async" data-page-index="${page.index}" src="${page.src}" alt="${escapeHtml(chapter.label)} trang ${page.index + 1}" />
      `).join('') : '<div class="page-missing">Chapter này chưa có ảnh trong cache. Import thêm chapter để đọc tiếp.</div>'}
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
  document.documentElement.style.setProperty('--reader-progress', `${Math.max(2, Math.round(progressPercent))}%`);
}

function ensureChapterLoaded(chapterId) {
  const index = importedChapters().findIndex((chapter) => chapter.id === chapterId);
  if (index >= 0) state.loadedChapterCount = Math.max(state.loadedChapterCount, index + 1);
}

function importedChapters() {
  return (state.series?.chapters || []).filter((chapter) => chapter.imported);
}

function currentChapter() {
  return (state.series?.chapters || []).find((chapter) => chapter.id === state.currentChapterId) || importedChapters()[0];
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
