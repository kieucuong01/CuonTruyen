function chapterOrderIndex(chapterId, catalogChapters = []) {
  const index = catalogChapters.findIndex((chapter) => chapter.id === chapterId);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

export function findNewReaderChapters(existing = [], incoming = []) {
  const existingIds = new Set(existing.map((chapter) => chapter?.id).filter(Boolean));
  return incoming.filter((chapter) => chapter?.id && !existingIds.has(chapter.id));
}

export function mergeReaderChapters(existing = [], incoming = [], catalogChapters = []) {
  const merged = [...existing];
  for (const chapter of incoming) {
    if (!chapter?.id) continue;
    const index = merged.findIndex((item) => item.id === chapter.id);
    if (index >= 0) merged[index] = chapter;
    else merged.push(chapter);
  }
  return merged.sort((a, b) => {
    const byCatalog = chapterOrderIndex(a.id, catalogChapters) - chapterOrderIndex(b.id, catalogChapters);
    if (byCatalog !== 0) return byCatalog;
    return String(a.id).localeCompare(String(b.id), 'vi', { sensitivity: 'base' });
  });
}

export function countReaderPages(chapters = []) {
  return chapters.reduce((sum, chapter) => sum + Number(chapter?.pages?.length || 0), 0);
}

const READER_IMAGE_RETRY_DELAYS = [500, 1200, 2200];

function appendReaderRetryParam(source = '', value = '') {
  const raw = String(source || '');
  if (!raw || !value) return raw;
  try {
    const absolute = /^[a-z][a-z\d+.-]*:/i.test(raw);
    const protocolRelative = raw.startsWith('//');
    const rootRelative = raw.startsWith('/');
    const url = new URL(raw, 'https://reader.local');
    url.searchParams.set('readerRetry', value);
    if (absolute) return url.toString();
    if (protocolRelative) return `//${url.host}${url.pathname}${url.search}${url.hash}`;
    if (rootRelative) return `${url.pathname}${url.search}${url.hash}`;
    return `${url.pathname.replace(/^\//, '')}${url.search}${url.hash}`;
  } catch {
    const [withoutHash, hash = ''] = raw.split('#');
    const separator = withoutHash.includes('?') ? '&' : '?';
    return `${withoutHash}${separator}readerRetry=${encodeURIComponent(value)}${hash ? `#${hash}` : ''}`;
  }
}

export function resolveReaderImageRetry({
  source = '',
  currentAttempt = 0,
  maxAttempts = 3,
  now = Date.now()
} = {}) {
  const src = String(source || '');
  const attempt = Math.max(0, Number(currentAttempt || 0));
  const limit = Math.max(0, Number(maxAttempts || 0));
  if (!src || attempt >= limit) {
    return {
      canRetry: false,
      attempt,
      delayMs: 0,
      src
    };
  }

  const nextAttempt = attempt + 1;
  return {
    canRetry: true,
    attempt: nextAttempt,
    delayMs: READER_IMAGE_RETRY_DELAYS[Math.min(nextAttempt - 1, READER_IMAGE_RETRY_DELAYS.length - 1)],
    src: appendReaderRetryParam(src, `${nextAttempt}-${now}`)
  };
}

export function resolveReaderCurrentChapterId({
  requestedId = '',
  currentId = '',
  payloadChapterId = '',
  firstLoadedId = ''
} = {}) {
  return requestedId || currentId || payloadChapterId || firstLoadedId || '';
}

export function resolveChapterMenuScrollTop({
  itemOffsetTop = 0,
  itemHeight = 0,
  listHeight = 0,
  maxScrollTop = 0
} = {}) {
  const target = Number(itemOffsetTop || 0) - (Number(listHeight || 0) / 2) + (Number(itemHeight || 0) / 2);
  const bounded = Math.max(0, Math.min(Number(maxScrollTop || 0), target));
  return Math.round(bounded);
}

function measureReaderImageHeight(image) {
  const rect = image?.getBoundingClientRect?.();
  const measuredHeight = Number(rect?.height || 0);
  if (Number.isFinite(measuredHeight) && measuredHeight > 1) {
    return Math.round(measuredHeight);
  }

  const measuredWidth = Number(rect?.width || image?.clientWidth || 0);
  const attrWidth = Number(image?.getAttribute?.('width') || image?.width || 0);
  const attrHeight = Number(image?.getAttribute?.('height') || image?.height || 0);
  if (measuredWidth > 0 && attrWidth > 0 && attrHeight > 0) {
    return Math.round((measuredWidth * attrHeight) / attrWidth);
  }

  return 0;
}

export function releaseReaderImageElement(image, blankSrc) {
  if (!image || !blankSrc) return false;
  const currentAttribute = image.getAttribute?.('src') || image.src || '';
  if (currentAttribute === blankSrc) return false;

  const currentSource = image.dataset?.readerSrc || image.currentSrc || image.src || currentAttribute;
  if (currentSource && currentSource !== blankSrc && image.dataset) {
    image.dataset.readerSrc = currentSource;
  }

  const height = measureReaderImageHeight(image);
  if (height > 0 && image.style) {
    image.style.height = `${height}px`;
  }
  if (image.dataset) image.dataset.readerReleased = 'true';
  image.src = blankSrc;
  image.loading = 'lazy';
  return true;
}

export function restoreReaderImageElement(image, source, blankSrc) {
  if (!image || !source || source === blankSrc) return false;
  const currentAttribute = image.getAttribute?.('src') || image.src || '';
  if (currentAttribute !== blankSrc) return false;

  const clearReleasedHeight = () => {
    const current = image.getAttribute?.('src') || image.src || '';
    if (current && current !== blankSrc && image.dataset?.readerReleased === 'true') {
      image.style.height = '';
      delete image.dataset.readerReleased;
    }
  };

  if (image.addEventListener) {
    image.addEventListener('load', clearReleasedHeight, { once: true });
  }
  image.src = source;
  if (image.complete) clearReleasedHeight();
  return true;
}

export function resolveReaderToolbarVisibility({
  scrollY = 0,
  lastScrollY = 0,
  currentVisible = true,
  forceShow = false,
  drawerOpen = false,
  topThreshold = 120,
  delta = 14
} = {}) {
  if (forceShow || drawerOpen) return true;
  if (scrollY <= topThreshold) return true;
  if (scrollY > lastScrollY + delta) return false;
  if (scrollY < lastScrollY - delta) return true;
  return currentVisible;
}
