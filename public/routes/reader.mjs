import { hasReadableChapter } from '../chapterState.mjs';

export function resolveReaderRoute(locationLike = globalThis.location) {
  const hash = String(locationLike?.hash || '');
  const pathname = String(locationLike?.pathname || '/');
  const hashMatch = hash.match(/^#\/read\/([^/]+)/);
  if (hashMatch) {
    return {
      kind: 'hash-reader',
      seriesId: decodeURIComponent(hashMatch[1])
    };
  }

  const chapterMatch = pathname.match(/^\/truyen\/([^/]+)\/([^/]+)$/);
  if (chapterMatch) {
    return {
      kind: 'chapter-reader',
      seriesSlug: decodeURIComponent(chapterMatch[1]),
      chapterSlug: decodeURIComponent(chapterMatch[2])
    };
  }

  return null;
}

export function getReadableChapters(series) {
  return (series?.chapters || []).filter(hasReadableChapter);
}

export function getNextSummaryAfterLastLoaded({ readerChapters = [], series } = {}) {
  const lastLoaded = readerChapters[readerChapters.length - 1];
  if (!lastLoaded) return null;
  const chapters = getReadableChapters(series);
  const index = chapters.findIndex((chapter) => chapter.id === lastLoaded.id);
  return index >= 0 ? chapters[index + 1] || null : null;
}

export function getChapterIndex(series, chapterId) {
  const index = getReadableChapters(series).findIndex((chapter) => chapter.id === chapterId);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

export function getCurrentReaderChapter({ readerChapters = [], currentChapterId = '', series } = {}) {
  return readerChapters.find((chapter) => chapter.id === currentChapterId)
    || getReadableChapters(series).find((chapter) => chapter.id === currentChapterId)
    || readerChapters[0]
    || getReadableChapters(series)[0];
}

export function resolveContinueChapterProgress(series, progress) {
  const readable = getReadableChapters(series);
  if (!readable.length) {
    return {
      chapter: null,
      chapterNumber: 0,
      completed: 0,
      total: 0,
      percent: 0
    };
  }

  const targetId = String(progress?.chapterId || '').trim();
  const chapterIndex = targetId
    ? readable.findIndex((item) => {
      const candidates = [item.id, item.slug, chapterHrefSegment(item)].filter(Boolean).map(String);
      return candidates.includes(targetId);
    })
    : 0;
  const safeIndex = chapterIndex >= 0 ? chapterIndex : 0;
  const chapterNumber = safeIndex + 1;
  const total = readable.length;

  return {
    chapter: readable[safeIndex] || readable[0],
    chapterNumber,
    completed: chapterNumber,
    total,
    percent: Math.round((chapterNumber / total) * 100)
  };
}

export function chapterHrefSegment(chapter = {}) {
  const slug = chapter.slug && chapter.slug !== 'series' ? chapter.slug : '';
  return encodeURIComponent(slug || chapter.id || '');
}
