import {
  canSaveReaderProgress,
  createProgressSnapshot,
  createResumeLoadPlan,
  findCurrentChapterFromLayout,
  loadLastSeriesId,
  loadProgress,
  loadReadingHistory,
  saveProgress
} from './readingProgress.mjs';
import { hasReadableChapter } from './chapterState.mjs';
import { createApiClient } from './apiClient.mjs';
import { apiUrl, getRuntimeConfig } from './runtimeConfig.mjs';
import { sendAnalyticsEvent } from './analyticsClient.mjs';
import { escapeAttr, escapeHtml, throttle } from './domUtils.mjs';
import { scrollToTopForRoute } from './navigation.mjs';
import { STATIC_INFO_PAGES, createHomeRoute } from './routes/home.mjs';
import { createAdminRoute, loadAdminToken } from './routes/admin.mjs';
import {
  chapterHrefSegment as routeChapterHrefSegment,
  getChapterIndex,
  getCurrentReaderChapter,
  getNextSummaryAfterLastLoaded,
  getReadableChapters,
  resolveContinueChapterProgress,
  resolveReaderRoute
} from './routes/reader.mjs';
import {
  resolveSavedScrollTop as resolveRestoreScrollTop,
  shouldRestoreProgress
} from './readerRestore.mjs';
import {
  countReaderPages,
  findNewReaderChapters,
  mergeReaderChapters,
  releaseReaderImageElement,
  resolveChapterMenuScrollTop,
  resolveReaderImageRetry,
  resolveReaderToolbarVisibility,
  restoreReaderImageElement,
  resolveReaderCurrentChapterId
} from './readerWindow.mjs';
import { applySeriesFilters, buildTagOptions } from './seriesFilters.mjs';
import {
  clearUserSession,
  isFollowingSeries,
  loadFollowedSeriesIds,
  loadUserSession,
  saveUserSession,
  toggleFollowSeries
} from './userState.mjs';
import {
  renderAdSlotHtml,
  normalizeMonetizationConfig,
  shouldShowAds
} from './monetization.mjs';
import {
  renderBrandLogoView,
  renderTopbarView,
  renderUserAuthPage
} from './siteChromeView.mjs';

function getMonetizationConfig() {
  const rootConfig = globalThis.COMIC_READER_CONFIG || {};
  return normalizeMonetizationConfig(rootConfig.monetization || rootConfig);
}

function currentRouteKey() {
  return globalThis.location ? `${location.pathname || '/'}${location.hash || ''}` : '/';
}

function adsAreVisible() {
  return shouldShowAds({ route: currentRouteKey(), config: getMonetizationConfig() });
}

function getDonateUrl() {
  return getMonetizationConfig().donateUrl || '#/support';
}

let adsenseScriptPromise = null;

function loadAdsenseScript(clientId = '') {
  const client = String(clientId || '').trim();
  if (!client || typeof document === 'undefined') return Promise.resolve(false);
  const existing = [...document.querySelectorAll('script[data-adsense-client]')]
    .find((script) => script.dataset.adsenseClient === client);
  if (existing) return Promise.resolve(true);
  if (adsenseScriptPromise) return adsenseScriptPromise;
  adsenseScriptPromise = new Promise((resolve) => {
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.adsenseClient = client;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return adsenseScriptPromise;
}

function hydrateAdSlots(root = document) {
  const config = getMonetizationConfig();
  if (config.adsProvider !== 'adsense' || !config.adsenseClient || typeof root?.querySelectorAll !== 'function') return;
  const adUnits = [...root.querySelectorAll('ins.adsbygoogle')]
    .filter((unit) => unit.dataset.adPushed !== 'true');
  if (!adUnits.length) return;
  loadAdsenseScript(config.adsenseClient).then((loaded) => {
    if (!loaded) return;
    globalThis.adsbygoogle = globalThis.adsbygoogle || [];
    adUnits.forEach((unit) => {
      if (unit.dataset.adPushed === 'true') return;
      unit.dataset.adPushed = 'true';
      try {
        globalThis.adsbygoogle.push({});
      } catch {
        unit.dataset.adPushed = 'failed';
      }
    });
  });
}

function renderAdSlot(placement, options = {}) {
  if (!adsAreVisible()) return '';
  return renderAdSlotHtml({
    config: getMonetizationConfig(),
    placement,
    ...options
  });
}

const app = document.querySelector('#app');
const BRAND_NAME = 'Cuộn Truyện';
const BRAND_TAGLINE = 'Đọc liền mạch, lưu đúng chương';
const BRAND_LOGO = '/favicon.svg?v=3';
const state = {
  catalog: { series: [] },
  catalogFull: { series: [] },
  home: { hot: [], updated: [], tags: [] },
  series: null,
  readerChapters: [],
  loadedChapterCount: 0,
  currentChapterId: '',
  drawerOpen: false,
  saving: false,
  restoringProgress: false,
  readerRestoreSnapshot: null,
  readerRestoreTimer: null,
  readerRestoreAttempts: 0,
  loadingNextChapter: false,
  readerScrollTimer: null,
  readerScrollHandler: null,
  readerToolbarTimer: null,
  readerLastScrollY: 0,
  readerToolbarRevealUntil: 0,
  readerInteractionHandler: null,
  readerObservers: [],
  readerImageRetryTimers: new Set(),
  searchQuery: '',
  filters: {
    query: '',
    tag: 'all',
    status: 'all',
    sort: 'updated'
  }
};

const apiClient = createApiClient({
  adminTokenProvider: () => loadAdminToken(),
  userTokenProvider: () => loadUserSession()?.token
});


const navigation = {
  token: 0,
  timer: null,
  activeElement: null
};
const READER_EAGER_IMAGE_COUNT = 12;
const READER_PRELOAD_AHEAD_COUNT = 28;
const READER_PRELOAD_ROOT_MARGIN = '6500px 0px';
const READER_IMAGE_RELEASE_BEHIND_PX = 28000;
const READER_BLANK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const READER_RELEASE_MEDIA_QUERY = '(hover: hover) and (pointer: fine)';
const preloadedImageUrls = new Set();
const readerPreloadLinkUrls = new Set();
const readerDecodeQueue = new Set();

const icon = {
  back: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevronLeft: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevronRight: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  menu: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="2"/><path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1a2.1 2.1 0 0 1-3 3l-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1.1 1.7V21a2.1 2.1 0 0 1-4.2 0v-.2a1.8 1.8 0 0 0-1.2-1.7 1.8 1.8 0 0 0-2 .4l-.1.1a2.1 2.1 0 1 1-3-3l.1-.1a1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.7-1.1H2a2.1 2.1 0 0 1 0-4.2h.2a1.8 1.8 0 0 0 1.7-1.2 1.8 1.8 0 0 0-.4-2l-.1-.1a2.1 2.1 0 1 1 3-3l.1.1a1.8 1.8 0 0 0 2 .4h.1a1.8 1.8 0 0 0 1-1.7V2a2.1 2.1 0 0 1 4.2 0v.2a1.8 1.8 0 0 0 1.1 1.7 1.8 1.8 0 0 0 2-.4l.1-.1a2.1 2.1 0 1 1 3 3l-.1.1a1.8 1.8 0 0 0-.4 2v.1a1.8 1.8 0 0 0 1.7 1h.2a2.1 2.1 0 0 1 0 4.2h-.2a1.8 1.8 0 0 0-1.8 1.2Z" stroke="currentColor" stroke-width="2"/></svg>'
};

const adminRoute = createAdminRoute({
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
});
const renderAdmin = adminRoute.renderAdmin;
const renderAdminSeriesDetail = adminRoute.renderAdminSeriesDetail;

const homeRoute = createHomeRoute({
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
});
const renderHome = homeRoute.renderHome;
const renderStaticInfoPage = homeRoute.renderStaticInfoPage;

window.addEventListener('hashchange', route);
window.addEventListener('popstate', route);

document.addEventListener('click', (event) => {
  const userLogout = event.target.closest('[data-user-logout]');
  if (userLogout) {
    event.preventDefault();
    clearUserSession();
    history.pushState({}, '', '/');
    route();
    return;
  }

  const followButton = event.target.closest('[data-follow-series]');
  if (followButton) {
    event.preventDefault();
    handleFollowToggle(followButton);
    return;
  }

  const donateControl = event.target.closest('[data-donate-click]');
  if (donateControl) {
    sendEvent('donate_click', {
      placement: donateControl.dataset.donateClick || '',
      seriesSlug: state.series?.slug,
      chapterId: state.currentChapterId
    });
  }

  const link = event.target.closest('[data-link]');
  if (!link) return;
  event.preventDefault();
  flushReaderProgress();
  setControlPending(link);
  history.pushState({}, '', link.getAttribute('href'));
  route();
});

document.addEventListener('pointerover', (event) => {
  prefetchTarget(event.target.closest('[data-link], [data-read]'));
}, { passive: true });

document.addEventListener('focusin', (event) => {
  prefetchTarget(event.target.closest('[data-link], [data-read]'));
});

route();

async function route() {
  const token = startNavigation('Đang tải trang...');
  try {
    await routeCore();
    scrollToTopForRoute(window, location);
  } catch (error) {
    app.innerHTML = `
      <main class="site-shell">
        ${renderTopbar()}
        <section class="empty-state">Không thể tải trang: ${escapeHtml(error.message)}</section>
      </main>
    `;
  } finally {
    stopNavigation(token);
  }
}

async function routeCore() {
  flushReaderProgress();
  if (location.hash === '#/admin') {
    history.replaceState({}, '', '/admin');
  }
  const readerRoute = resolveReaderRoute(location);
  if (readerRoute?.kind === 'hash-reader') {
    await renderReader(readerRoute.seriesId);
    return;
  }
  if (location.pathname === '/admin') {
    await renderAdmin();
    return;
  }
  const adminSeriesMatch = location.pathname.match(/^\/admin\/series\/([^/]+)$/);
  if (adminSeriesMatch) {
    await renderAdminSeriesDetail(decodeURIComponent(adminSeriesMatch[1]));
    return;
  }
  if (location.hash === '#/login' || location.hash === '#/register') {
    renderUserAuth();
    return;
  }
  if (location.hash === '#/following') {
    await renderFollowingPage();
    return;
  }
  if (location.hash === '#/history') {
    await renderHistoryPage();
    return;
  }
  if (location.hash === '#/search') {
    await renderExplorePage({ mode: 'search' });
    return;
  }
  if (location.hash === '#/genres') {
    await renderExplorePage({ mode: 'genres' });
    return;
  }

  if (readerRoute?.kind === 'chapter-reader') {
    await renderReaderFromSlug(readerRoute.seriesSlug, readerRoute.chapterSlug);
    return;
  }

  const seriesMatch = location.pathname.match(/^\/truyen\/([^/]+)$/);
  if (seriesMatch) {
    await renderSeriesDetail(decodeURIComponent(seriesMatch[1]));
    return;
  }

  const tagMatch = location.pathname.match(/^\/the-loai\/([^/]+)$/);
  if (tagMatch) {
    await renderExplorePage({ mode: 'genres', tagSlug: decodeURIComponent(tagMatch[1]) });
    return;
  }

  if (STATIC_INFO_PAGES[location.pathname]) {
    renderStaticInfoPage(location.pathname);
    return;
  }

  await renderHome();
}

function fetchJson(...args) {
  return apiClient.fetchJson(...args);
}

function invalidateContentCache() {
  return apiClient.invalidateContentCache();
}

function adminHeaders(extra = {}) {
  return apiClient.adminHeaders(extra);
}

function userHeaders(extra = {}) {
  return apiClient.userHeaders(extra);
}

async function loadCatalog({ full = false } = {}) {
  if (full) {
    state.catalogFull = await fetchJson('/api/series?full=1');
    return state.catalogFull;
  }
  state.catalog = await fetchJson('/api/series');
  return state.catalog;
}

async function loadHome() {
  state.home = await fetchJson('/api/home');
  return state.home;
}

function seriesApiPath(seriesId) {
  const params = new URLSearchParams({ series: String(seriesId || '') });
  return `/api/series?${params.toString()}`;
}




function renderMonetizationPanel(placement = 'home') {
  const adSlot = renderAdSlot('home', {
    className: 'home-ad',
    label: 'Quảng cáo'
  });

  return `
    ${adSlot}
    <section class="monetization-panel" aria-label="Ung ho Cuon Truyen">
      <div>
        <p class="eyebrow">Ủng hộ dự án</p>
        <h2>Đọc miễn phí, ủng hộ bằng donate và quảng cáo nhẹ</h2>
        <p class="support-note">Cuộn Truyện không bán gói trả phí nữa. Nếu thấy hữu ích, bạn có thể donate hoặc để quảng cáo nhẹ hỗ trợ chi phí vận hành.</p>
      </div>
      <div class="support-actions">
        <a class="primary-action" href="${escapeAttr(getDonateUrl())}" target="_blank" rel="noopener" data-donate-click="${escapeAttr(placement)}">Donate</a>
      </div>
    </section>
  `;
}

function renderReaderAdBreak(chapter) {
  return renderAdSlot('chapter-end', {
    className: 'reader-ad',
    seriesSlug: state.series?.slug || '',
    chapterSlug: chapter?.id || state.currentChapterId || '',
    label: 'Quảng cáo cuối chapter'
  });
}

function reportVisibleAdSlots() {
  return observeVisibleAdSlots(document);
}

function reportAdImpression(slot) {
  if (!slot || slot.dataset.reported === 'true') return;
  slot.dataset.reported = 'true';
  sendEvent('ad_impression', {
    placement: slot.dataset.adPlacement || '',
    slotId: slot.dataset.adSlotId || '',
    provider: slot.dataset.adProvider || '',
    seriesSlug: slot.dataset.seriesSlug || state.series?.slug,
    chapterId: slot.dataset.chapterSlug || state.currentChapterId
  });
}

function observeVisibleAdSlots(root = document) {
  hydrateAdSlots(root);
  if (typeof root?.querySelectorAll !== 'function') return null;
  const slots = [...root.querySelectorAll('[data-ad-placement]')];
  if (!slots.length) return null;
  if (typeof IntersectionObserver === 'undefined') {
    slots.forEach(reportAdImpression);
    return null;
  }
  const timers = new WeakMap();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const slot = entry.target;
      if (slot.dataset.reported === 'true') return;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        if (timers.has(slot)) return;
        const timer = setTimeout(() => {
          timers.delete(slot);
          reportAdImpression(slot);
          observer.unobserve(slot);
        }, 800);
        timers.set(slot, timer);
        return;
      }
      const timer = timers.get(slot);
      if (timer) {
        clearTimeout(timer);
        timers.delete(slot);
      }
    });
  }, { threshold: [0, 0.5, 0.75] });
  slots.forEach((slot) => observer.observe(slot));
  return observer;
}

function renderTopbar() {
  return renderTopbarView({
    brandName: BRAND_NAME,
    brandTagline: BRAND_TAGLINE,
    brandLogo: BRAND_LOGO,
    pathname: location.pathname,
    hash: location.hash,
    user: loadUserSession()
  });
}

function renderBrandLogo({ compact = false } = {}) {
  return renderBrandLogoView({
    brandName: BRAND_NAME,
    brandTagline: BRAND_TAGLINE,
    brandLogo: BRAND_LOGO,
    compact
  });
}

function renderContinueShelf(items, lastSeries) {
  const fallback = lastSeries ? [{ series: lastSeries, progress: loadProgress(lastSeries.id) }] : [];
  const rows = items.length ? items : fallback;
  return `
    <section class="continue-section" id="continue-section">
      <div class="section-head">
        <div>
          <h2>Đọc tiếp</h2>
          <p>Những truyện đang đọc được lưu trên trình duyệt này.</p>
        </div>
        ${rows.length ? `
          <div class="shelf-controls" aria-label="Điều hướng danh sách đọc tiếp">
            <button class="icon-btn shelf-btn" type="button" data-continue-prev aria-label="Lùi danh sách đọc tiếp">${icon.chevronLeft}</button>
            <button class="icon-btn shelf-btn" type="button" data-continue-next aria-label="Tiến danh sách đọc tiếp">${icon.chevronRight}</button>
          </div>
        ` : ''}
      </div>
      <div class="continue-list" data-continue-list>
        ${rows.length ? rows.map(({ series, progress }) => renderContinueItem(series, progress)).join('') : '<div class="empty-state">Chưa có lịch sử đọc. Mở một truyện và scroll một chút để lưu vị trí.</div>'}
      </div>
    </section>
  `;
}

function renderContinueItem(series, progress) {
  const { chapterNumber, completed, total, percent } = resolveContinueChapterProgress(series, progress);
  const chapterLabel = chapterNumber ? `Chapter ${chapterNumber}` : 'Chapter đầu';
  return `
    <article class="continue-card" data-read="${series.id}">
      <div class="mini-cover">${renderCoverImage(series, 'CT')}</div>
      <div class="continue-copy">
        <strong title="${escapeAttr(series.title)}">${escapeHtml(series.title)}</strong>
        <span class="continue-chapter">Đang đọc: ${escapeHtml(chapterLabel)}</span>
        <span class="continue-progress">${completed}/${total || 0} chương</span>
        <div class="mini-meter"><div style="width:${Math.max(4, Math.min(100, percent || 4))}%"></div></div>
        <span class="continue-cta">Đọc tiếp</span>
      </div>
    </article>
  `;
}

function coverImageUrl(series = {}) {
  return series.thumbnailUrl || series.coverThumbnailUrl || series.coverUrl || series.imageUrl || '';
}

function renderCoverImage(series = {}, fallback = 'No cover', attributes = 'loading="lazy" decoding="async"') {
  const coverUrl = coverImageUrl(series);
  return coverUrl
    ? `<img ${attributes} src="${escapeAttr(coverUrl)}" alt="${escapeAttr(series.title || 'Truyen')}">`
    : `<span>${escapeHtml(fallback)}</span>`;
}

function normalizeTagValue(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

function seriesOriginLabel(series = {}) {
  const tagValues = (series.tags || []).map((tag) => normalizeTagValue(
    typeof tag === 'string' ? tag : `${tag.slug || ''} ${tag.name || ''}`
  ));
  if (tagValues.some((tag) => tag.includes('manhwa') || tag.includes('truyen-han'))) return 'Truyện Hàn';
  if (tagValues.some((tag) => tag.includes('manga') || tag.includes('truyen-nhat'))) return 'Truyện Nhật';
  if (tagValues.some((tag) => tag.includes('manhua') || tag.includes('truyen-trung'))) return 'Truyện Trung';
  return series.sourceMappings?.[0]?.adapter || 'Truyện tranh';
}

function renderTrendingSection(seriesList) {
  return `
    <section class="panel-section trending-section">
      <div class="section-head">
        <h2>Truyện tranh đang thịnh hành</h2>
      </div>
      <div class="trending-grid">
        ${seriesList.length ? seriesList.map(renderTrendingCard).join('') : '<div class="empty-state">Chưa có truyện thịnh hành.</div>'}
      </div>
    </section>
  `;
}

function renderTrendingCard(series) {
  const imported = series.importedChapterCount || series.chapters.filter(hasReadableChapter).length;
  const firstChapter = series.chapters.find(hasReadableChapter);
  return `
    <article class="trending-card">
      <a class="trending-cover" data-link href="/truyen/${series.slug}">
        ${renderCoverImage(series, 'No cover')}
        <small>${escapeHtml(seriesOriginLabel(series))}</small>
      </a>
      <h3><a data-link href="/truyen/${series.slug}">${escapeHtml(series.title)}</a></h3>
      <p>${escapeHtml(firstChapter?.label || `${imported} chapter`)}</p>
      <div class="rating">★★★★★ <span>${Number(series.stats?.views || 5) ? '5' : '4.9'}</span></div>
    </article>
  `;
}

function renderUpdatedSection(seriesList) {
  return `
    <section class="panel-section updated-section">
      <div class="section-head">
        <h2>Mới cập nhật</h2>
        <button class="small-orange" type="button">Xem tất cả</button>
      </div>
      <div class="updated-grid">
        ${seriesList.length ? seriesList.slice(0, 8).map(renderUpdatedItem).join('') : '<div class="empty-state">Chưa có truyện mới.</div>'}
      </div>
    </section>
  `;
}

function renderUpdatedItem(series) {
  const chapters = (series.chapters || []).filter(hasReadableChapter).slice(0, 3);
  return `
    <article class="updated-item">
      <a class="update-cover" data-link href="/truyen/${series.slug}">
        ${renderCoverImage(series, 'CT')}
      </a>
      <div>
        <h3><a data-link href="/truyen/${series.slug}">${escapeHtml(series.title)}</a></h3>
        <div class="chapter-mini-list">
          ${chapters.length ? chapters.map((chapter, index) => `
            <a data-link href="/truyen/${series.slug}/${chapterHrefSegment(chapter)}">
              <span>${escapeHtml(chapter.label || chapter.title)}</span>
              <small>${index + 4} giờ trước</small>
            </a>
          `).join('') : '<span class="muted">Chưa có chapter cache</span>'}
        </div>
      </div>
    </article>
  `;
}

function renderPopularSidebar(seriesList) {
  return `
    <section class="popular-panel">
      <div class="section-head">
        <h2>Truyện phổ biến</h2>
      </div>
      <div class="rank-tabs"><button>Tuần</button><button>Tháng</button><button>Tất cả</button></div>
      <ol class="rank-list">
        ${seriesList.length ? seriesList.map((series, index) => renderRankItem(series, index)).join('') : '<li class="empty-state">Chưa có xếp hạng.</li>'}
      </ol>
    </section>
  `;
}

function renderRankItem(series, index) {
  const firstChapter = series.chapters.find(hasReadableChapter);
  return `
    <li>
      <span class="rank-number">${index + 1}</span>
      <a class="rank-cover" data-link href="/truyen/${series.slug}">
        ${renderCoverImage(series, 'CT')}
      </a>
      <div>
        <strong><a data-link href="/truyen/${series.slug}">${escapeHtml(series.title)}</a></strong>
        <small>${escapeHtml(firstChapter?.label || 'Đang cập nhật')}</small>
        <div class="rating">★★★★★ <span>4.${9 - (index % 5)}</span></div>
      </div>
    </li>
  `;
}

function renderRail(title, seriesList, variant = '') {
  return `
    <section class="content-rail ${variant}">
      <h2 class="section-title">${escapeHtml(title)}</h2>
      <div class="series-grid">
        ${seriesList.length ? seriesList.map(renderSeriesCard).join('') : '<div class="empty-state">Chưa có truyện phù hợp.</div>'}
      </div>
    </section>
  `;
}

function renderSeriesCard(series) {
  const imported = series.importedChapterCount || series.chapters.filter(hasReadableChapter).length;
  const chapterCount = Number(series.chapterCount || series.chapters.length || 0);
  const pages = series.pageCount || series.chapters.reduce((sum, chapter) => sum + Number(chapter.pageCount || chapter.pages?.length || 0), 0);
  return `
    <article class="series-card">
      <a class="series-cover" data-link href="/truyen/${series.slug}">
        ${renderCoverImage(series, 'No cover')}
      </a>
      <div class="series-card-copy">
        <h3><a data-link href="/truyen/${series.slug}">${escapeHtml(series.title)}</a></h3>
        <p>${imported}/${chapterCount} chapter, ${pages} ảnh cache.</p>
        <div class="tag-row">${(series.tags || []).slice(0, 3).map((tag) => `<a data-link href="/the-loai/${tag.slug}">${escapeHtml(tag.name)}</a>`).join('')}</div>
      </div>
      <div class="card-actions">
        <button class="primary-btn" data-read="${series.id}">Đọc</button>
        <a class="ghost-btn" data-link href="/truyen/${series.slug}">Chi tiết</a>
      </div>
    </article>
  `;
}

async function renderSeriesDetailLegacy(slug) {
  stopReaderRuntime();
  const series = await fetchJson(seriesApiPath(slug));
  sendEvent('pageview', { seriesSlug: series.slug });
  const imported = series.chapters.filter(hasReadableChapter);
  const user = loadUserSession();
  const following = user ? isFollowingSeries(series.id, { user }) : false;
  app.innerHTML = `
    <main class="site-shell">
      ${renderTopbar()}
      <section class="series-detail">
        <div class="detail-cover">${renderCoverImage(series, 'No cover', 'decoding="async"')}</div>
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
            ${imported[0] ? `<a class="ghost-btn" data-link href="/truyen/${series.slug}/${chapterHrefSegment(imported[0])}">Chapter đầu</a>` : ''}
          </div>
        </div>
      </section>
      ${renderAdSlot('series', {
        className: 'series-ad',
        seriesSlug: series.slug,
        label: 'Quảng cáo trang truyện'
      })}
      ${renderSeriesContinueCard(series)}
      <section class="chapter-panel">
        <h2 class="section-title">Danh sách chapter</h2>
        <div class="chapter-list-inline">
          ${series.chapters.map((chapter) => renderChapterListItem(series, chapter)).join('')}
        </div>
      </section>
    </main>
  `;
  bindReadButtons();
}

async function renderSeriesDetail(slug) {
  stopReaderRuntime();
  const series = await fetchJson(seriesApiPath(slug));
  sendEvent('pageview', { seriesSlug: series.slug });
  const imported = series.chapters.filter(hasReadableChapter);
  const user = loadUserSession();
  const following = user ? isFollowingSeries(series.id, { user }) : false;
  app.innerHTML = `
    <main class="site-shell">
      ${renderTopbar()}
      <section class="series-detail">
        <div class="detail-cover">${renderCoverImage(series, 'No cover', 'decoding="async"')}</div>
        <div class="detail-copy">
          <div class="tag-row">${(series.tags || []).map((tag) => `<a data-link href="/the-loai/${tag.slug}">${escapeHtml(tag.name)}</a>`).join('')}</div>
          <h2>${escapeHtml(series.title)}</h2>
          <p>${escapeHtml(series.description || 'Truyện đã cache về máy, sẵn sàng đọc liên tục và lưu vị trí trên trình duyệt.')}</p>
          <div class="metric-strip">
            <span>${series.stats?.views || 0} views</span>
            <span>${imported.length}/${series.chapters.length} chapter public</span>
            <span>${series.stats?.readDepth || 0}% read depth</span>
          </div>
          <div class="detail-actions">
            <button class="primary-btn" data-read="${series.id}">Đọc ngay</button>
            ${imported[0] ? `<a class="ghost-btn" data-link href="/truyen/${series.slug}/${chapterHrefSegment(imported[0])}">Chapter đầu</a>` : ''}
            ${user
              ? `<button class="ghost-btn follow-btn ${following ? 'active' : ''}" type="button" data-follow-series="${escapeAttr(series.id)}">${following ? 'Bỏ theo dõi' : 'Theo dõi'}</button>`
              : '<a class="ghost-btn" data-link href="#/login">Đăng nhập để theo dõi</a>'}
          </div>
        </div>
      </section>
      ${renderAdSlot('series', {
        className: 'series-ad',
        seriesSlug: series.slug,
        label: 'Quảng cáo trang truyện'
      })}
      ${renderSeriesContinueCard(series)}
      <section class="chapter-panel">
        <h2 class="section-title">Danh sách chapter</h2>
        <div class="chapter-list-inline">
          ${series.chapters.map((chapter) => renderChapterListItem(series, chapter)).join('')}
        </div>
      </section>
    </main>
  `;
  bindReadButtons();
}

async function renderTagPage(tagSlug) {
  stopReaderRuntime();
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

function renderUserAuth() {
  stopReaderRuntime();
  const user = loadUserSession();
  const isRegister = location.hash === '#/register';
  app.innerHTML = renderUserAuthPage({
    topbarHtml: renderTopbar(),
    user,
    isRegister,
    googleStartUrl: apiUrl('/api/auth/google/start')
  });
  app.querySelector('[data-user-login-form]').addEventListener('submit', handleUserLogin);
}

async function handleUserLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const status = form.querySelector('[data-status]');
  const formData = new FormData(form);
  const isRegister = location.hash === '#/register';
  setControlPending(button);
  if (status) status.textContent = isRegister ? '\u0110ang t\u1ea1o t\u00e0i kho\u1ea3n...' : '\u0110ang \u0111\u0103ng nh\u1eadp...';
  try {
    const session = await fetchJson(isRegister ? '/api/users/register' : '/api/users/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identifier: formData.get('identifier'),
        password: formData.get('password'),
        displayName: formData.get('displayName')
      })
    });
    saveUserSession(session);
    history.pushState({}, '', '/');
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

async function renderFollowingPage() {
  stopReaderRuntime();
  const user = loadUserSession();
  if (!user) {
    app.innerHTML = `
      <main class="site-shell">
        ${renderTopbar()}
        <section class="page-heading">
          <h2>Theo dõi</h2>
          <p>Đăng nhập để lưu truyện theo dõi.</p>
          <a class="primary-btn inline-action" data-link href="#/login">Đăng nhập để theo dõi</a>
        </section>
      </main>
    `;
    return;
  }

  const catalog = await loadCatalog();
  const ids = loadFollowedSeriesIds({ user });
  const lookup = new Map((catalog.series || []).map((series) => [series.id, series]));
  const followed = ids.map((id) => lookup.get(id)).filter(Boolean);
  app.innerHTML = `
    <main class="site-shell">
      ${renderTopbar()}
      <section class="page-heading">
        <h2>Truyện đang theo dõi</h2>
        <p>${followed.length} bộ truyện đã lưu cho ${escapeHtml(user.displayName)}.</p>
      </section>
      ${renderRail('Danh sách theo dõi', followed)}
    </main>
  `;
  bindReadButtons();
  sendEvent('pageview', { page: 'following' });
}

async function renderHistoryPage() {
  stopReaderRuntime();
  const catalog = await loadCatalog({ full: true });
  const ids = loadReadingHistory();
  const lookup = new Map((catalog.series || []).map((series) => [series.id, series]));
  const rows = ids
    .map((id) => lookup.get(id))
    .filter(Boolean)
    .map((series) => ({ series, progress: loadProgress(series.id) }));

  app.innerHTML = `
    <main class="site-shell">
      ${renderTopbar()}
      <section class="page-heading">
        <h2>Lịch sử đọc</h2>
        <p>Mở lại đúng chapter và vị trí đọc gần nhất trên máy này.</p>
      </section>
      ${renderContinueShelf(rows, null)}
    </main>
  `;
  bindReadButtons();
  bindContinueSlider();
  sendEvent('pageview', { page: 'history' });
}

async function renderExplorePage({ mode = 'search', tagSlug = '' } = {}) {
  stopReaderRuntime();
  const tagPage = mode === 'genres' && tagSlug
    ? await fetchJson(`/api/tags?tag=${encodeURIComponent(tagSlug)}`).catch(() => null)
    : null;
  const catalog = tagPage ? { series: tagPage.series || [] } : await loadCatalog();
  if (mode === 'search' && state.searchQuery && !state.filters.query) state.filters.query = state.searchQuery;
  if (tagSlug) state.filters.tag = tagSlug;
  const seriesList = catalog.series || [];
  const tags = buildTagOptions(seriesList);
  const filters = {
    ...state.filters,
    query: mode === 'search' ? state.filters.query : state.filters.query,
    tag: state.filters.tag || 'all'
  };
  const results = applySeriesFilters(seriesList, filters);
  const title = mode === 'genres' ? 'Thể loại' : 'Tìm kiếm truyện';
  const subtitle = mode === 'genres'
    ? 'Lọc theo thể loại, trạng thái cache và số chapter để tìm bộ đọc liền mạch.'
    : 'Tìm theo tên, slug, alias hoặc tag; kết quả được lọc trực tiếp từ thư viện.';

  app.innerHTML = `
    <main class="site-shell">
      ${renderTopbar()}
      <section class="page-heading">
        <h2>${title}</h2>
        <p>${subtitle}</p>
      </section>
      ${renderFilterPanel(filters, tags)}
      <section class="tab-summary">
        <strong>${results.length}</strong>
        <span>kết quả phù hợp</span>
      </section>
      ${renderRail('Danh sách truyện', results)}
    </main>
  `;
  bindExploreFilters(mode);
  bindReadButtons();
  sendEvent('pageview', { page: mode });
}

function renderFilterPanel(filters, tags) {
  return `
    <section class="filter-panel">
      <label>
        <span>Từ khóa</span>
        <input data-filter-field="query" value="${escapeAttr(filters.query || '')}" placeholder="Nhập tên truyện..." />
      </label>
      <label>
        <span>Thể loại</span>
        <select data-filter-field="tag">
          <option value="all">Tất cả thể loại</option>
          ${tags.map((tag) => `<option value="${escapeAttr(tag.slug)}" ${filters.tag === tag.slug ? 'selected' : ''}>${escapeHtml(tag.name)} (${tag.count})</option>`).join('')}
        </select>
      </label>
      <label>
        <span>Trạng thái</span>
        <select data-filter-field="status">
          <option value="all" ${filters.status === 'all' ? 'selected' : ''}>Tất cả</option>
          <option value="readable" ${filters.status === 'readable' ? 'selected' : ''}>Đã có ảnh đọc</option>
          <option value="complete" ${filters.status === 'complete' ? 'selected' : ''}>Đủ chapter cache</option>
          <option value="unreadable" ${filters.status === 'unreadable' ? 'selected' : ''}>Chưa có ảnh</option>
        </select>
      </label>
      <label>
        <span>Sắp xếp</span>
        <select data-filter-field="sort">
          <option value="updated" ${filters.sort === 'updated' ? 'selected' : ''}>Mới cập nhật</option>
          <option value="popular" ${filters.sort === 'popular' ? 'selected' : ''}>Phổ biến</option>
          <option value="chapters" ${filters.sort === 'chapters' ? 'selected' : ''}>Nhiều chapter</option>
          <option value="title" ${filters.sort === 'title' ? 'selected' : ''}>Tên A-Z</option>
        </select>
      </label>
      <button class="ghost-btn" type="button" data-filter-reset>Đặt lại</button>
    </section>
  `;
}

function bindExploreFilters(mode) {
  app.querySelectorAll('[data-filter-field]').forEach((field) => {
    const update = throttle(() => {
      state.filters[field.dataset.filterField] = field.value.trim();
      renderExplorePage({ mode });
    }, field.tagName === 'INPUT' ? 300 : 0);
    field.addEventListener(field.tagName === 'INPUT' ? 'input' : 'change', update);
  });
  app.querySelector('[data-filter-reset]')?.addEventListener('click', () => {
    state.filters = { query: '', tag: 'all', status: 'all', sort: 'updated' };
    renderExplorePage({ mode });
  });
}

function handleFollowToggle(button) {
  const user = loadUserSession();
  if (!user) {
    history.pushState({}, '', '#/login');
    route();
    return;
  }
  try {
    const result = toggleFollowSeries(button.dataset.followSeries, { user });
    button.classList.toggle('active', result.following);
    button.textContent = result.following ? 'Bỏ theo dõi' : 'Theo dõi';
  } catch (error) {
    button.textContent = error.message;
  }
}

function renderStatusSelect(name, value) {
  const options = [
    ['public', 'Public'],
    ['draft', 'Draft'],
    ['removed', 'Removed']
  ];
  return `<select name="${name}">${options.map(([key, label]) => `<option value="${key}" ${value === key ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
}

async function renderReader(seriesId) {
  const series = await fetchJson(seriesApiPath(seriesId));
  const saved = loadProgress(series.id);
  const plan = createResumeLoadPlan(readableChapters(series), saved);
  const target = readableChapters(series).find((chapter) => chapter.id === plan.currentChapterId) || readableChapters(series)[0];
  state.series = series;
  if (target) {
    applyReaderPayload(await loadReaderChapter(series.slug, chapterHrefSegment(target)), { reset: true, currentChapterId: target.id });
  } else {
    state.readerChapters = [];
  }
  prepareReader({ chapterId: target?.id || saved?.chapterId });
  drawReader();
  state.restoringProgress = shouldRestoreProgress(saved);
  attachReaderObservers();
  restoreScroll(saved);
  sendEvent('pageview', { seriesSlug: state.series.slug });
}

async function renderReaderFromSlug(seriesSlug, chapterSlug) {
  const payload = await loadReaderChapter(seriesSlug, chapterSlug);
  await ensureReaderSeriesDetail(payload, seriesSlug);
  const { series, chapter } = payload;
  applyReaderPayload(payload, { reset: true, currentChapterId: chapter.id });
  prepareReader({ chapterId: chapter.id });
  drawReader();
  attachReaderObservers();
  requestAnimationFrame(() => {
    document.querySelector(`[data-chapter-id="${CSS.escape(chapter.id)}"]`)?.scrollIntoView({ behavior: 'instant' });
  });
  sendEvent('pageview', { seriesSlug: state.series.slug, chapterSlug: chapter.slug });
}

async function ensureReaderSeriesDetail(payload, seriesSlug) {
  if (Array.isArray(payload?.series?.chapters) && payload.series.chapters.length) return payload;
  const seriesKey = payload?.series?.slug || seriesSlug;
  const detail = await fetchJson(seriesApiPath(seriesKey));
  payload.series = {
    ...(payload.series || {}),
    ...detail,
    chapters: detail.chapters || []
  };
  return payload;
}

async function loadReaderChapter(seriesSlug, chapterSlug) {
  try {
    return await fetchJson(readerChapterApiPath(seriesSlug, chapterSlug, { window: 0 }));
  } catch (error) {
    const series = await fetchJson(seriesApiPath(seriesSlug));
    const chapter = findChapterByRoute(series.chapters, chapterSlug);
    if (chapter && hasReadableChapter(chapter)) {
      return await fetchJson(readerChapterApiPath(series.slug, chapterHrefSegment(chapter), { window: 0 }));
    }
    const fallback = nearestReadableChapter(series.chapters, chapter);
    if (fallback) {
      history.replaceState({}, '', `/truyen/${series.slug}/${chapterHrefSegment(fallback)}`);
      return await fetchJson(readerChapterApiPath(series.slug, chapterHrefSegment(fallback), { window: 0 }));
    }
    throw error;
  }
}

function readerChapterApiPath(seriesSlug, chapterSlug, { window = 0, start = '' } = {}) {
  const params = new URLSearchParams({
    series: String(seriesSlug || ''),
    chapter: String(chapterSlug || ''),
    window: String(window)
  });
  if (start) params.set('start', start);
  return `/api/reader?${params.toString()}`;
}

function applyReaderPayload(payload, { reset = false, currentChapterId = '' } = {}) {
  const previousChapters = Array.isArray(state.series?.chapters) ? state.series.chapters : [];
  state.series = {
    ...(payload.series || state.series || {}),
    chapters: Array.isArray(payload.series?.chapters) && payload.series.chapters.length
      ? payload.series.chapters
      : previousChapters
  };
  const incoming = (payload.chapters?.length ? payload.chapters : [payload.chapter])
    .filter(Boolean)
    .map(sanitizeReaderChapter);
  const added = reset ? incoming : findNewReaderChapters(state.readerChapters, incoming);
  state.readerChapters = reset ? incoming : mergeChapters(state.readerChapters, incoming);
  state.currentChapterId = resolveReaderCurrentChapterId({
    requestedId: currentChapterId,
    currentId: state.currentChapterId,
    payloadChapterId: payload.chapter?.id,
    firstLoadedId: state.readerChapters[0]?.id
  });
  state.loadedChapterCount = state.readerChapters.length;
  return { incoming, added };
}

function sanitizeReaderChapter(chapter = {}) {
  const pages = Array.isArray(chapter.pages) ? chapter.pages : [];
  const cleanPages = sanitizeReaderPages(pages);
  return {
    ...chapter,
    pages: cleanPages,
    pageCount: cleanPages.length || chapter.pageCount || 0
  };
}

function sanitizeReaderPages(pages = []) {
  if (!Array.isArray(pages)) return [];
  const normalized = pages.map(normalizeReaderPage);
  if (normalized.length < 3) return normalized;
  return normalized.filter((page, index) => !isStandaloneBoundaryAdPage(page, index, normalized.length));
}

function normalizeReaderPage(page = {}, index = 0) {
  if (Array.isArray(page)) {
    return {
      order: Number(page[0] ?? index),
      imageUrl: resolveReaderImageUrl(page[1] || ''),
      width: page[2] || null,
      height: page[3] || null
    };
  }
  return {
    ...page,
    order: Number(page.order ?? page.index ?? index),
    imageUrl: resolveReaderImageUrl(page.imageUrl || page.src || '')
  };
}

function resolveReaderImageUrl(value = '') {
  const url = String(value || '');
  if (!url || /^https?:\/\//i.test(url)) return url;
  if (!url.startsWith('/imports/')) return url;
  const config = getRuntimeConfig();
  const importsBase = String(config.importsBaseUrl || '').replace(/\/$/, '');
  return importsBase ? `${importsBase}${url}` : url;
}

function isStandaloneBoundaryAdPage(page = {}, index = 0, total = 0) {
  const isBoundary = index === 0 || index === total - 1;
  if (!isBoundary || total < 3) return false;

  const width = Number(page.width || 0);
  const height = Number(page.height || 0);
  if (!width || !height) return false;

  const aspect = height / width;
  return width >= 600 && height <= 620 && aspect <= 0.65;
}

function mergeChapters(existing = [], incoming = []) {
  return mergeReaderChapters(existing, incoming, readableChapters());
}

function findChapterByRoute(chapters = [], chapterSlug = '') {
  const target = String(chapterSlug || '').trim();
  const normalizedTarget = normalizeSearchText(target);
  return chapters.find((chapter) => {
    const candidates = [
      chapter.id,
      chapter.slug,
      chapter.label,
      chapter.title
    ].filter(Boolean);
    return candidates.some((candidate) => (
      String(candidate) === target || normalizeSearchText(candidate) === normalizedTarget
    ));
  }) || null;
}

function nearestReadableChapter(chapters = [], chapter = null) {
  const readable = chapters.filter(hasReadableChapter);
  if (!readable.length) return null;
  if (!chapter) return readable[0];
  const sourceOrder = Number(chapter.sourceOrder);
  if (!Number.isFinite(sourceOrder)) return readable[0];
  return [...readable].reverse().find((item) => Number(item.sourceOrder) <= sourceOrder) || readable[0];
}

function renderSeriesContinueCard(series) {
  const progress = loadProgress(series.id);
  if (!progress?.chapterId) return '';
  const { chapter, chapterNumber, completed, total } = resolveContinueChapterProgress(series, progress);
  if (!chapter) return '';
  const chapterLabel = chapterNumber ? `Chapter ${chapterNumber}` : (chapter.label || chapter.title || 'Chapter');
  return `
    <section class="series-continue-card">
      <div>
        <strong>Đang đọc dở</strong>
        <span>${escapeHtml(chapterLabel)} - ${completed}/${total || 0} chương</span>
      </div>
      <button class="primary-btn" type="button" data-read="${escapeAttr(series.id)}">Đọc tiếp</button>
    </section>
  `;
}

function renderChapterListItem(series, chapter) {
  const count = chapter.pageCount || chapter.pages?.length || 0;
  const label = `
    <span>${escapeHtml(chapter.title || chapter.label)}</span>
    <small>${count ? `${count} ảnh` : 'Chưa cache'}</small>
  `;
  if (!hasReadableChapter(chapter)) {
    return `<span class="chapter-list-item disabled" aria-disabled="true">${label}</span>`;
  }
  return `<a class="chapter-list-item" data-link href="/truyen/${series.slug}/${chapterHrefSegment(chapter)}">${label}</a>`;
}

function prepareReader(saved) {
  const plan = createResumeLoadPlan(readableChapters(), saved);
  state.loadedChapterCount = state.readerChapters.length || plan.loadedChapterCount;
  state.currentChapterId = plan.currentChapterId || state.series.chapters[0]?.id || '';
  state.drawerOpen = false;
}

function drawReader() {
  const visibleChapters = state.readerChapters;
  const hasNext = Boolean(nextSummaryAfterLastLoaded());
  app.innerHTML = `
    <main class="reader" data-reader-page-count="${countReaderPages(visibleChapters)}">
      <header class="reader-toolbar">
        <a class="reader-logo" data-link href="/" title="Về trang chủ">${renderBrandLogo({ compact: true })}</a>
        <button class="icon-btn" title="Quay lại" data-back>${icon.back}</button>
        <div class="reader-title">
          <strong>${escapeHtml(state.series.title)}</strong>
          <span data-current-label>${escapeHtml(currentChapter()?.label || 'Chưa có chapter')}</span>
        </div>
        <button class="reader-continue-btn" data-continue>Đọc tiếp</button>
        <button class="icon-btn reader-menu-btn" title="Danh sách chapter" data-open-drawer>${icon.menu}</button>
      </header>
      <nav class="reader-bottom-bar" aria-label="Điều hướng đọc truyện">
        <button class="reader-bottom-action" type="button" data-continue><span>Đọc tiếp</span></button>
        <button class="reader-bottom-action" type="button" data-open-drawer><span>Chapter</span></button>
        <a class="reader-bottom-action" data-link href="/truyen/${state.series.slug}"><span>Truyện</span></a>
        <a class="reader-bottom-action" href="${escapeAttr(getDonateUrl())}" target="_blank" rel="noopener" data-donate-click="reader-menu"><span>Ủng hộ</span></a>
      </nav>
      <section class="chapter-stream">
        ${visibleChapters.map(renderChapter).join('')}
        <div class="loader-row" data-load-more>${hasNext ? 'Đang nối chapter tiếp theo...' : 'Đã hết phần đã import'}</div>
      </section>
      <div data-drawer-root></div>
    </main>
  `;

  app.querySelector('[data-back]').addEventListener('click', () => {
    history.pushState({}, '', `/truyen/${state.series.slug}`);
    location.hash = '';
    route();
  });
  app.querySelectorAll('[data-open-drawer]').forEach((button) => button.addEventListener('click', () => {
    showReaderToolbar({ persist: true });
    state.drawerOpen = true;
    renderDrawer();
  }));
  app.querySelectorAll('[data-continue]').forEach((button) => button.addEventListener('click', () => {
    showReaderToolbar();
    const progress = loadProgress(state.series.id);
    window.scrollTo({ top: resolveSavedScrollTop(progress), behavior: 'smooth' });
  }));
  renderDrawer();
}

function appendReaderChapters(chapters = []) {
  const stream = app.querySelector('.chapter-stream');
  const loader = app.querySelector('[data-load-more]');
  if (!stream || !loader || !chapters.length) {
    updateLoadMoreLabel();
    return;
  }

  const previousScrollY = window.scrollY;
  const html = chapters
    .map((chapter) => renderChapter(chapter, state.readerChapters.findIndex((item) => item.id === chapter.id)))
    .join('');
  loader.insertAdjacentHTML('beforebegin', html);
  app.querySelector('.reader')?.setAttribute('data-reader-page-count', String(countReaderPages(state.readerChapters)));
  updateLoadMoreLabel();
  attachReaderObservers();
  window.scrollTo({ top: previousScrollY, behavior: 'instant' });
}

function updateLoadMoreLabel() {
  const loader = app.querySelector('[data-load-more]');
  if (!loader) return;
  loader.textContent = nextSummaryAfterLastLoaded()
    ? 'Đang nối chapter tiếp theo...'
    : 'Đã hết phần đã import';
}

function renderReaderChapterFooter(chapter) {
  const chapters = readableChapters();
  const index = chapters.findIndex((item) => item.id === chapter.id);
  const next = index >= 0 ? chapters[index + 1] : null;
  return `
    <footer class="reader-chapter-actions">
      <a class="ghost-btn" data-link href="/truyen/${state.series.slug}">Chi tiết truyện</a>
      <a class="ghost-btn" data-link href="#/history">Lịch sử</a>
      <a class="ghost-btn" href="${escapeAttr(getDonateUrl())}" target="_blank" rel="noopener" data-donate-click="reader">Donate</a>
      ${next ? `<a class="primary-btn" data-link href="/truyen/${state.series.slug}/${chapterHrefSegment(next)}">Chapter tiếp</a>` : '<span>Đã tới chapter mới nhất đã publish.</span>'}
    </footer>
  `;
}

function renderChapter(chapter, index) {
  const pages = chapter.pages || [];
  return `
    <article class="chapter-block" data-chapter-id="${chapter.id}">
      <div class="chapter-heading">${escapeHtml(chapter.label)}</div>
      ${pages.length ? pages.map((page, pagePosition) => {
        const imageIndex = readerImageIndex(index, pagePosition);
        const eager = imageIndex < READER_EAGER_IMAGE_COUNT;
        const width = Number(page.width || 900);
        const height = Number(page.height || 1300);
        return `
        <div class="reader-page" data-reader-page data-page-index="${page.order}" data-reader-state="loading">
          <img class="page-image" loading="${eager ? 'eager' : 'lazy'}" fetchpriority="${imageIndex < 4 ? 'high' : 'auto'}" decoding="async" data-reader-image data-reader-src="${escapeAttr(page.imageUrl)}" data-reader-image-index="${imageIndex}" data-page-index="${page.order}" src="${escapeAttr(page.imageUrl)}" width="${width}" height="${height}" alt="${escapeHtml(chapter.label)} trang ${Number(page.order) + 1}" />
          <div class="reader-image-fallback" aria-live="polite">
            <strong>Ảnh chưa tải được</strong>
            <span data-reader-image-status>Đây là lỗi tải ảnh từ S3/CDN, không phải lỗi truyện.</span>
            <button class="ghost-btn reader-image-retry" type="button" data-reader-image-retry>Thử lại ảnh</button>
          </div>
        </div>
      `;
      }).join('') : '<div class=\"page-missing\">Chapter này chưa có ảnh trong cache. Crawl thêm để đọc tiếp.</div>'}
      ${renderReaderChapterFooter(chapter)}
      ${renderReaderAdBreak(chapter)}
    </article>
  `;
}

function readerImageIndex(chapterPosition, pagePosition) {
  let index = pagePosition;
  for (let i = 0; i < chapterPosition; i += 1) {
    index += state.readerChapters[i]?.pages?.length || 0;
  }
  return index;
}

function renderDrawer() {
  const root = app.querySelector('[data-drawer-root]');
  if (!root) return;
  if (!state.drawerOpen) {
    root.innerHTML = '';
    return;
  }
  const chapters = readableChapters();
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
      scheduleReaderToolbarHide();
    });
  });
  root.querySelectorAll('[data-jump]').forEach((button) => {
    button.addEventListener('click', () => {
      const chapter = readableChapters().find((item) => item.id === button.dataset.jump);
      state.drawerOpen = false;
      if (!chapter) return;
      history.pushState({}, '', `/truyen/${state.series.slug}/${chapterHrefSegment(chapter)}`);
      route();
    });
  });
  scrollDrawerToCurrentChapter(root);
}

function scrollDrawerToCurrentChapter(root) {
  const list = root.querySelector('.chapter-list');
  const active = root.querySelector('.chapter-item.active');
  if (!list || !active) return;

  const applyScroll = () => {
    list.scrollTop = resolveChapterMenuScrollTop({
      itemOffsetTop: active.offsetTop,
      itemHeight: active.offsetHeight,
      listHeight: list.clientHeight,
      maxScrollTop: Math.max(0, list.scrollHeight - list.clientHeight)
    });
  };

  applyScroll();
  requestAnimationFrame(applyScroll);
}

function attachReaderObservers() {
  stopReaderRuntime();
  const chapterObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    state.currentChapterId = visible.target.dataset.chapterId;
    syncCurrentChapterLabel();
  }, { threshold: [0.25, 0.55] });

  document.querySelectorAll('[data-chapter-id]').forEach((chapter) => chapterObserver.observe(chapter));
  state.readerObservers.push(chapterObserver);

  const loader = document.querySelector('[data-load-more]');
  const loadObserver = new IntersectionObserver(async (entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    await loadNextReaderChapter();
  }, { rootMargin: '900px 0px' });
  if (loader) loadObserver.observe(loader);
  state.readerObservers.push(loadObserver);

  const adObserver = observeVisibleAdSlots(document);
  if (adObserver) state.readerObservers.push(adObserver);

  const imageObserver = new IntersectionObserver((entries) => {
    entries
      .filter((entry) => entry.isIntersecting)
      .forEach((entry) => warmReaderImage(entry.target));
  }, { rootMargin: READER_PRELOAD_ROOT_MARGIN, threshold: 0 });
  document.querySelectorAll('[data-reader-image]').forEach((image) => imageObserver.observe(image));
  document.querySelectorAll('[data-reader-image]').forEach((image) => {
    setupReaderImageRecovery(image);
  });
  document.querySelector('.chapter-stream')?.addEventListener('click', handleReaderImageRetryClick);
  state.readerObservers.push(imageObserver);

  state.readerScrollHandler = throttle(() => {
    updateReaderToolbarFromScroll();
    warmReaderImagesAroundViewport();
    releaseFarBehindReaderImages();
    saveReaderProgress();
  }, 260);
  window.addEventListener('scroll', state.readerScrollHandler, { passive: true });
  startReaderToolbarControls();
  startReaderScrollSync();
  preloadInitialReaderImages();
  warmReaderImagesAroundViewport({ initial: true });
  releaseFarBehindReaderImages();
  saveReaderProgress();
}

function preloadInitialReaderImages() {
  const images = [...document.querySelectorAll('[data-reader-image]')].slice(0, READER_EAGER_IMAGE_COUNT);
  images.forEach((image, index) => {
    const source = image.dataset.readerSrc || image.currentSrc || image.src;
    preloadReaderLink(source, { highPriority: index < 6 });
  });
}

function startReaderToolbarControls() {
  showReaderToolbar({ persist: true });
  state.readerLastScrollY = window.scrollY;
  state.readerInteractionHandler = (event) => {
    if (event.type === 'click' && event.target?.closest?.('.chapter-stream')) return;
    showReaderToolbar({ holdMs: 1800 });
  };
  ['click', 'keydown'].forEach((eventName) => {
    window.addEventListener(eventName, state.readerInteractionHandler, { passive: true });
  });
  state.readerTapHandler = (event) => {
    if (event.target?.closest?.('a, button, input, select, textarea, [data-ad-placement]')) return;
    toggleReaderToolbarFromTap();
  };
  document.querySelector('.chapter-stream')?.addEventListener('click', state.readerTapHandler, { passive: true });
  scheduleReaderToolbarHide(2600);
}

function toggleReaderToolbarFromTap() {
  const reader = document.querySelector('.reader');
  if (!reader) return;
  if (reader.classList.contains('is-toolbar-hidden')) {
    showReaderToolbar({ holdMs: 2600 });
    return;
  }
  if (window.scrollY > 120 && !state.drawerOpen) hideReaderToolbar();
}

function showReaderToolbar({ persist = false, holdMs = 0 } = {}) {
  const reader = document.querySelector('.reader');
  if (!reader) return;
  if (holdMs > 0) state.readerToolbarRevealUntil = Math.max(state.readerToolbarRevealUntil, Date.now() + holdMs);
  reader.classList.remove('is-toolbar-hidden');
  reader.classList.add('is-toolbar-visible');
  if (!persist) scheduleReaderToolbarHide(Math.max(1800, holdMs + 400));
}

function hideReaderToolbar() {
  if (Date.now() < state.readerToolbarRevealUntil) return;
  if (state.drawerOpen || window.scrollY <= 120) return;
  const reader = document.querySelector('.reader');
  if (!reader) return;
  reader.classList.add('is-toolbar-hidden');
  reader.classList.remove('is-toolbar-visible');
}

function scheduleReaderToolbarHide(delay = 1800) {
  window.clearTimeout(state.readerToolbarTimer);
  state.readerToolbarTimer = window.setTimeout(() => {
    hideReaderToolbar();
  }, delay);
}

function updateReaderToolbarFromScroll() {
  const reader = document.querySelector('.reader');
  if (!reader) return;
  const scrollY = window.scrollY;
  const visible = resolveReaderToolbarVisibility({
    scrollY,
    lastScrollY: state.readerLastScrollY,
    currentVisible: !reader.classList.contains('is-toolbar-hidden'),
    forceShow: Date.now() < state.readerToolbarRevealUntil,
    drawerOpen: state.drawerOpen
  });
  state.readerLastScrollY = scrollY;
  if (visible) showReaderToolbar({ holdMs: scrollY > 120 ? 2200 : 0 });
  else hideReaderToolbar();
}

function warmReaderImagesAroundViewport({ initial = false } = {}) {
  const images = [...document.querySelectorAll('[data-reader-image]')];
  if (!images.length) return;

  const firstAheadIndex = images.findIndex((image) => image.getBoundingClientRect().bottom >= -window.innerHeight);
  const startIndex = Math.max(0, firstAheadIndex < 0 ? 0 : firstAheadIndex);
  const warmCount = initial
    ? Math.max(READER_EAGER_IMAGE_COUNT, READER_PRELOAD_AHEAD_COUNT)
    : READER_PRELOAD_AHEAD_COUNT;

  images
    .slice(startIndex, startIndex + warmCount)
    .forEach((image, index) => warmReaderImage(image, { highPriority: initial && index < 8 }));
}

function warmReaderImage(image, { highPriority = false } = {}) {
  if (!image) return;
  const source = image.dataset.readerSrc || image.currentSrc || image.src;
  if (!source) return;
  restoreReaderImageElement(image, source, READER_BLANK_IMAGE);
  image.loading = 'eager';
  if ('fetchPriority' in image) image.fetchPriority = highPriority ? 'high' : 'auto';
  preloadImageUrl(source);
  decodeReaderImageSoon(image);
}

function readerPageForImage(image) {
  return image?.closest?.('[data-reader-page]') || null;
}

function setReaderPageStatus(image, status, message = '') {
  const page = readerPageForImage(image);
  if (!page) return;
  page.dataset.readerState = status;
  const statusNode = page.querySelector('[data-reader-image-status]');
  if (statusNode && message) statusNode.textContent = message;
}

function clearReaderImageRetryTimer(image) {
  const timerId = Number(image?.dataset?.readerRetryTimer || 0);
  if (!timerId) return;
  window.clearTimeout(timerId);
  state.readerImageRetryTimers.delete(timerId);
  delete image.dataset.readerRetryTimer;
}

function setupReaderImageRecovery(image) {
  if (!image || image.dataset.readerRecoveryAttached === 'true') return;
  image.dataset.readerRecoveryAttached = 'true';
  image.addEventListener('load', () => {
    clearReaderImageRetryTimer(image);
    image.dataset.readerRetryAttempt = '0';
    setReaderPageStatus(image, 'loaded');
    stabilizeReaderAfterImageLoad();
  });
  image.addEventListener('error', () => {
    handleReaderImageError(image);
  });
  if (image.complete && Number(image.naturalWidth || 0) > 0) {
    setReaderPageStatus(image, 'loaded');
  }
}

function handleReaderImageError(image) {
  if (!image) return;
  clearReaderImageRetryTimer(image);
  const source = image.dataset.readerSrc || image.getAttribute('src') || image.src || '';
  const retry = resolveReaderImageRetry({
    source,
    currentAttempt: image.dataset.readerRetryAttempt || 0
  });
  image.dataset.readerRetryAttempt = String(retry.attempt);
  if (!retry.canRetry) {
    setReaderPageStatus(image, 'error', 'Ảnh lỗi sau nhiều lần thử. Đây là lỗi ảnh/CDN, không phải lỗi truyện.');
    showReaderToolbar({ holdMs: 2600 });
    return;
  }
  setReaderPageStatus(image, 'retrying', `Ảnh lỗi, đang thử lại lần ${retry.attempt}/3...`);
  const timerId = window.setTimeout(() => {
    state.readerImageRetryTimers.delete(timerId);
    delete image.dataset.readerRetryTimer;
    image.src = retry.src;
  }, retry.delayMs);
  image.dataset.readerRetryTimer = String(timerId);
  state.readerImageRetryTimers.add(timerId);
}

function retryReaderImageNow(image) {
  if (!image) return;
  clearReaderImageRetryTimer(image);
  const source = image.dataset.readerSrc || image.getAttribute('src') || image.src || '';
  const retry = resolveReaderImageRetry({
    source,
    currentAttempt: 0
  });
  image.dataset.readerRetryAttempt = String(retry.attempt);
  setReaderPageStatus(image, 'retrying', 'Đang thử tải lại ảnh...');
  image.src = retry.canRetry ? retry.src : source;
  image.loading = 'eager';
  if ('fetchPriority' in image) image.fetchPriority = 'high';
  preloadImageUrl(image.src);
}

function handleReaderImageRetryClick(event) {
  const button = event.target?.closest?.('[data-reader-image-retry]');
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const image = button.closest('[data-reader-page]')?.querySelector('[data-reader-image]');
  retryReaderImageNow(image);
  showReaderToolbar({ holdMs: 2200 });
}

function preloadImageUrl(src) {
  if (!src || preloadedImageUrls.has(src)) return;
  preloadedImageUrls.add(src);
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
}

function preloadReaderLink(src, { highPriority = false } = {}) {
  if (!src || readerPreloadLinkUrls.has(src)) return;
  readerPreloadLinkUrls.add(src);
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = src;
  if (highPriority) link.fetchPriority = 'high';
  document.head.appendChild(link);
}

function decodeReaderImageSoon(image) {
  if (!image || readerDecodeQueue.has(image) || !image.decode) return;
  readerDecodeQueue.add(image);
  const run = () => {
    image.decode()
      .catch(() => {})
      .finally(() => readerDecodeQueue.delete(image));
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 900 });
  else window.setTimeout(run, 80);
}

function releaseFarBehindReaderImages() {
  if (!shouldReleaseReaderImages()) return;
  document.querySelectorAll('[data-reader-image]').forEach((image) => {
    const rect = image.getBoundingClientRect();
    if (rect.bottom >= -READER_IMAGE_RELEASE_BEHIND_PX) return;
    releaseReaderImageElement(image, READER_BLANK_IMAGE);
  });
}

function shouldReleaseReaderImages() {
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(READER_RELEASE_MEDIA_QUERY).matches;
}

function saveReaderProgress() {
  if (!state.series || state.saving) return;
  const doc = document.documentElement;
  const progressPercent = (window.scrollY / Math.max(1, doc.scrollHeight - window.innerHeight)) * 100;
  updateCurrentChapterFromScroll();
  const current = currentChapter();
  if (!canSaveReaderProgress({
    isRestoring: state.restoringProgress,
    hasSeries: Boolean(state.series),
    hasChapter: Boolean(current),
    hasReader: Boolean(document.querySelector('.reader'))
  })) return;
  const currentImage = document.elementFromPoint(window.innerWidth / 2, Math.min(window.innerHeight - 120, 360));
  const pageIndex = Number(currentImage?.closest?.('[data-page-index]')?.dataset?.pageIndex || currentImage?.dataset?.pageIndex || 0);
  const chapterNode = document.querySelector(`[data-chapter-id="${CSS.escape(current.id)}"]`);
  const chapterTop = chapterNode ? window.scrollY + chapterNode.getBoundingClientRect().top : 0;
  const chapterScrollY = Math.max(0, Math.round(window.scrollY - chapterTop));
  saveProgress(createProgressSnapshot({
    seriesId: state.series.id,
    chapterId: current.id,
    pageIndex,
    scrollY: Math.round(window.scrollY),
    chapterScrollY,
    progressPercent
  }));
  if (progressPercent >= 70) prefetchNextReaderChapter();
  sendReadDepth(progressPercent);
}

function updateCurrentChapterFromScroll() {
  const viewportElement = document
    .elementFromPoint(window.innerWidth / 2, Math.min(window.innerHeight * 0.42, 360))
    ?.closest?.('[data-chapter-id]');
  if (viewportElement?.dataset?.chapterId && viewportElement.dataset.chapterId !== state.currentChapterId) {
    state.currentChapterId = viewportElement.dataset.chapterId;
    syncCurrentChapterLabel();
    return;
  }

  const chapterLayouts = [...document.querySelectorAll('[data-chapter-id]')].map((node) => {
    const rect = node.getBoundingClientRect();
    return {
      id: node.dataset.chapterId,
      top: window.scrollY + rect.top,
      bottom: window.scrollY + rect.bottom
    };
  });
  const viewportY = window.scrollY + Math.min(window.innerHeight * 0.42, 360);
  const nextChapterId = findCurrentChapterFromLayout(chapterLayouts, viewportY, state.currentChapterId);
  if (nextChapterId && nextChapterId !== state.currentChapterId) {
    state.currentChapterId = nextChapterId;
    syncCurrentChapterLabel();
  }
}

function syncCurrentChapterLabel() {
  const label = app.querySelector('[data-current-label]');
  if (label) label.textContent = currentChapter()?.label || '';
  renderDrawer();
}

function startReaderScrollSync() {
  stopReaderScrollTimer();
  state.readerScrollTimer = window.setInterval(() => {
    if (!document.querySelector('.reader')) {
      stopReaderRuntime();
      return;
    }
    updateCurrentChapterFromScroll();
  }, 180);
}

function stopReaderScrollTimer() {
  if (!state.readerScrollTimer) return;
  window.clearInterval(state.readerScrollTimer);
  state.readerScrollTimer = null;
}

function stopReaderRuntime() {
  stopReaderScrollTimer();
  window.clearTimeout(state.readerToolbarTimer);
  window.clearTimeout(state.readerRestoreTimer);
  state.readerToolbarTimer = null;
  state.readerRestoreTimer = null;
  state.readerRestoreSnapshot = null;
  state.readerRestoreAttempts = 0;
  state.readerToolbarRevealUntil = 0;
  if (state.readerInteractionHandler) {
    ['mousedown', 'click', 'keydown'].forEach((eventName) => {
      window.removeEventListener(eventName, state.readerInteractionHandler);
    });
    state.readerInteractionHandler = null;
  }
  if (state.readerTapHandler) {
    document.querySelector('.chapter-stream')?.removeEventListener('click', state.readerTapHandler);
    document.querySelector('.chapter-stream')?.removeEventListener('click', handleReaderImageRetryClick);
    state.readerTapHandler = null;
  }
  if (state.readerRestoreCancelHandler) {
    ['touchstart', 'wheel', 'pointerdown'].forEach((eventName) => {
      window.removeEventListener(eventName, state.readerRestoreCancelHandler);
    });
    state.readerRestoreCancelHandler = null;
  }
  if (state.readerScrollHandler) {
    window.removeEventListener('scroll', state.readerScrollHandler);
    state.readerScrollHandler = null;
  }
  state.readerObservers.forEach((observer) => observer.disconnect());
  state.readerObservers = [];
  state.readerImageRetryTimers.forEach((timerId) => window.clearTimeout(timerId));
  state.readerImageRetryTimers.clear();
}

function flushReaderProgress() {
  if (!document.querySelector('.reader')) return;
  saveReaderProgress();
}

function startNavigation(label = 'Đang tải...') {
  const token = ++navigation.token;
  window.clearTimeout(navigation.timer);
  navigation.timer = window.setTimeout(() => {
    document.body.classList.add('app-loading');
    getGlobalLoader().querySelector('[data-loading-label]').textContent = label;
  }, 80);
  return token;
}

function stopNavigation(token) {
  if (token !== navigation.token) return;
  window.clearTimeout(navigation.timer);
  navigation.timer = null;
  document.body.classList.remove('app-loading');
  clearControlPending();
}

function getGlobalLoader() {
  let loader = document.querySelector('[data-global-loading]');
  if (loader) return loader;
  loader = document.createElement('div');
  loader.className = 'global-loading';
  loader.setAttribute('data-global-loading', '');
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');
  loader.innerHTML = '<span class="loader-dot"></span><span data-loading-label>Đang tải...</span>';
  document.body.append(loader);
  return loader;
}

function setControlPending(element) {
  clearControlPending();
  if (!element) return;
  navigation.activeElement = element;
  element.classList.add('is-pending');
  element.setAttribute('aria-busy', 'true');
  if ('disabled' in element) element.disabled = true;
}

function clearControlPending() {
  const element = navigation.activeElement;
  if (!element) return;
  element.classList.remove('is-pending');
  element.removeAttribute('aria-busy');
  if ('disabled' in element) element.disabled = false;
  navigation.activeElement = null;
}

function prefetchTarget(element) {
  if (!element) return;
  if (element.dataset.read) {
    fetchJson(seriesApiPath(element.dataset.read)).catch(() => {});
    return;
  }
  const href = element.getAttribute('href') || '';
  const chapterMatch = href.match(/^\/truyen\/([^/]+)\/([^/]+)$/);
  if (chapterMatch) {
    fetchJson(readerChapterApiPath(chapterMatch[1], chapterMatch[2], { window: 1 })).catch(() => {});
    return;
  }
  const seriesMatch = href.match(/^\/truyen\/([^/]+)$/);
  if (seriesMatch) {
    fetchJson(seriesApiPath(seriesMatch[1])).catch(() => {});
    return;
  }
  const tagMatch = href.match(/^\/the-loai\/([^/]+)$/);
  if (tagMatch) {
    fetchJson(`/api/tags/${encodeURIComponent(tagMatch[1])}`).catch(() => {});
    return;
  }
  if (href === '/' || href === '') {
    loadHome().catch(() => {});
  }
}

function uniqueSeriesById(seriesList) {
  const seen = new Set();
  return seriesList.filter((series) => {
    if (!series?.id || seen.has(series.id)) return false;
    seen.add(series.id);
    return true;
  });
}

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function searchLocalCatalog(seriesList, query) {
  const needle = normalizeSearchText(query);
  if (!needle) return [];
  return seriesList.filter((series) => {
    const haystack = normalizeSearchText([
      series.title,
      series.slug,
      ...(series.aliases || []),
      ...(series.tags || []).map((tag) => tag.name || tag.slug || tag)
    ].join(' '));
    return haystack.includes(needle);
  });
}

const sendReadDepth = throttle((progressPercent) => {
  sendEvent('read_depth', {
    seriesSlug: state.series?.slug,
    chapterId: state.currentChapterId,
    value: Math.round(progressPercent)
  });
}, 5000);

const saveProgressAfterImageLoad = throttle(() => {
  if (!document.querySelector('.reader') || state.restoringProgress) return;
  saveReaderProgress();
}, 900);

function resolveSavedScrollTop(saved) {
  return resolveRestoreScrollTop(saved, {
    scrollY: window.scrollY,
    findChapterNode: (chapterId) => document.querySelector(`[data-chapter-id="${CSS.escape(chapterId)}"]`)
  });
}

function applySavedScrollPosition(saved) {
  window.scrollTo({ top: resolveSavedScrollTop(saved), behavior: 'instant' });
}

function scheduleReaderRestore(delay = 120) {
  window.clearTimeout(state.readerRestoreTimer);
  state.readerRestoreTimer = window.setTimeout(() => {
    const saved = state.readerRestoreSnapshot;
    if (!saved) {
      state.restoringProgress = false;
      return;
    }
    if (state.readerRestoreInterrupted) {
      state.restoringProgress = false;
      state.readerRestoreSnapshot = null;
      if (state.readerRestoreCancelHandler) {
        ['touchstart', 'wheel', 'pointerdown'].forEach((eventName) => {
          window.removeEventListener(eventName, state.readerRestoreCancelHandler);
        });
        state.readerRestoreCancelHandler = null;
      }
      saveReaderProgress();
      return;
    }
    applySavedScrollPosition(saved);
    state.readerRestoreAttempts += 1;
    if (state.readerRestoreAttempts < 5) {
      scheduleReaderRestore(Math.min(720, 120 + (state.readerRestoreAttempts * 160)));
      return;
    }
    state.restoringProgress = false;
    state.readerRestoreSnapshot = null;
    if (state.readerRestoreCancelHandler) {
      ['touchstart', 'wheel', 'pointerdown'].forEach((eventName) => {
        window.removeEventListener(eventName, state.readerRestoreCancelHandler);
      });
      state.readerRestoreCancelHandler = null;
    }
    saveReaderProgress();
  }, delay);
}

function stabilizeReaderAfterImageLoad() {
  if (state.restoringProgress && state.readerRestoreSnapshot) {
    scheduleReaderRestore(80);
    return;
  }
  saveProgressAfterImageLoad();
}

function restoreScroll(saved) {
  if (saved?.chapterScrollY || saved?.scrollY) {
    state.readerRestoreSnapshot = saved;
    state.readerRestoreAttempts = 0;
    state.readerRestoreInterrupted = false;
    state.readerRestoreCancelHandler = () => {
      state.readerRestoreInterrupted = true;
    };
    ['touchstart', 'wheel', 'pointerdown'].forEach((eventName) => {
      window.addEventListener(eventName, state.readerRestoreCancelHandler, { passive: true });
    });
    scheduleReaderRestore(120);
    return;
  }
  state.restoringProgress = false;
}

function bindReadButtons() {
  app.querySelectorAll('[data-read]').forEach((button) => {
    button.addEventListener('click', () => {
      setControlPending(button);
      location.hash = `#/read/${encodeURIComponent(button.dataset.read)}`;
    });
  });
}

function bindContinueSlider() {
  const list = app.querySelector('[data-continue-list]');
  if (!list) return;
  const scrollByPage = (direction) => {
    const amount = Math.max(280, Math.round(list.clientWidth * 0.9));
    const maxScroll = Math.max(0, list.scrollWidth - list.clientWidth);
    const targetLeft = Math.max(0, Math.min(maxScroll, list.scrollLeft + direction * amount));
    list.scrollTo({ left: targetLeft, behavior: 'smooth' });
  };
  app.querySelector('[data-continue-prev]')?.addEventListener('click', (event) => {
    event.preventDefault();
    scrollByPage(-1);
  });
  app.querySelector('[data-continue-next]')?.addEventListener('click', (event) => {
    event.preventDefault();
    scrollByPage(1);
  });
}

async function loadNextReaderChapter() {
  if (state.loadingNextChapter) return;
  const next = nextSummaryAfterLastLoaded();
  if (!next) return;

  state.loadingNextChapter = true;
  try {
    const payload = await fetchJson(readerChapterApiPath(state.series.slug, chapterHrefSegment(next), { window: 0 }));
    const { added } = applyReaderPayload(payload);
    appendReaderChapters(added);
    releaseFarBehindReaderImages();
    prefetchNextReaderChapter();
  } finally {
    state.loadingNextChapter = false;
  }
}

function importedChapters() {
  return readableChapters();
}

function readableChapters(series = state.series) {
  return getReadableChapters(series);
}

function nextSummaryAfterLastLoaded() {
  return getNextSummaryAfterLastLoaded({
    readerChapters: state.readerChapters,
    series: state.series
  });
}

function chapterIndex(chapterId) {
  return getChapterIndex(state.series, chapterId);
}

function prefetchNextReaderChapter() {
  const next = nextSummaryAfterLastLoaded();
  if (!next) return;
  fetchJson(readerChapterApiPath(state.series.slug, chapterHrefSegment(next), { window: 0 })).catch(() => {});
}

function currentChapter() {
  return getCurrentReaderChapter({
    readerChapters: state.readerChapters,
    currentChapterId: state.currentChapterId,
    series: state.series
  });
}

function chapterHrefSegment(chapter = {}) {
  return routeChapterHrefSegment(chapter);
}

function sendEvent(type, payload = {}) {
  sendAnalyticsEvent({
    apiUrl,
    type,
    payload,
    href: location.href
  });
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}


