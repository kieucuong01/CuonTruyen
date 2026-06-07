export function pageSrc(page = {}) {
  if (Array.isArray(page)) return page[1] || '';
  return page.imageUrl || page.url || page.src || '';
}

export function chapterHrefSegment(chapter = {}) {
  const slug = chapter.slug && chapter.slug !== 'series' ? chapter.slug : '';
  return String(slug || chapter.id || '').trim();
}

export function readerChaptersFromPayload(payload = {}) {
  const chapters = Array.isArray(payload.chapters) && payload.chapters.length
    ? payload.chapters
    : payload.chapter
      ? [payload.chapter]
      : [];
  return chapters
    .filter((chapter) => chapter?.id)
    .map((chapter) => ({
      ...chapter,
      pages: Array.isArray(chapter.pages) ? chapter.pages : []
    }));
}

function hasReadableChapter(chapter = {}) {
  if (!chapter) return false;
  if (Array.isArray(chapter.pages) && chapter.pages.length > 0) return true;
  return Boolean(chapter.imported || Number(chapter.pageCount || 0) > 0);
}

function readableChapters(series = {}) {
  return (series.chapters || []).filter(hasReadableChapter);
}

export function getNextSummaryAfterLastLoaded({ readerChapters = [], series = {} } = {}) {
  const lastLoaded = readerChapters[readerChapters.length - 1];
  if (!lastLoaded) return null;
  const chapters = readableChapters(series);
  const index = chapters.findIndex((chapter) => chapter.id === lastLoaded.id);
  return index >= 0 ? chapters[index + 1] || null : null;
}

function chapterOrderIndex(chapterId, catalogChapters = []) {
  const index = catalogChapters.findIndex((chapter) => chapter.id === chapterId);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
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

export function readerChapterApiPath(seriesSlug, chapterSlug, { window = 0 } = {}) {
  const params = new URLSearchParams({
    series: String(seriesSlug || ''),
    chapter: String(chapterSlug || ''),
    window: String(window)
  });
  return `/api/reader?${params.toString()}`;
}

export function resolveActiveReaderChapterId({ layouts = [], viewportY = 0, fallbackId = '' } = {}) {
  const active = layouts.find((chapter) => viewportY >= chapter.top && viewportY < chapter.bottom);
  if (active?.id) return active.id;
  const previous = [...layouts].reverse().find((chapter) => viewportY >= chapter.top);
  return previous?.id || layouts[0]?.id || fallbackId || '';
}

export function readerCurrentChapterLabel(chapters = [], currentChapterId = '') {
  const active = chapters.find((chapter) => chapter?.id === currentChapterId);
  return String(active?.title || active?.label || active?.name || '').trim();
}

export function createReaderProgressSnapshot({
  seriesId = '',
  chapterId = '',
  pageIndex = 0,
  scrollY = 0,
  chapterTop = 0,
  documentScrollableHeight = 1
} = {}) {
  const progressPercent = (Number(scrollY || 0) / Math.max(1, Number(documentScrollableHeight || 1))) * 100;
  return {
    seriesId,
    chapterId,
    pageIndex: Number(pageIndex || 0),
    scrollY: Math.max(0, Math.round(Number(scrollY || 0))),
    chapterScrollY: Math.max(0, Math.round(Number(scrollY || 0) - Number(chapterTop || 0))),
    progressPercent: Math.max(0, Math.min(100, Math.round(progressPercent))),
    updatedAt: new Date().toISOString()
  };
}

export function progressStorageKey(seriesId) {
  return `comic-reader-progress:${seriesId}`;
}

export function updateReadingHistory(history = [], seriesId, limit = 8) {
  const next = [
    seriesId,
    ...history.filter((id) => id && id !== seriesId)
  ].filter(Boolean);
  return next.slice(0, limit);
}
