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

export function chapterHrefSegment(chapter = {}) {
  const slug = chapter.slug && chapter.slug !== 'series' ? chapter.slug : '';
  return encodeURIComponent(slug || chapter.id || '');
}
