export function progressStorageKey(seriesId) {
  return `comic-reader-progress:${seriesId}`;
}

export function chapterHrefSegment(chapter = {}) {
  return String(chapter.slug || chapter.chapterSlug || chapter.chapterId || chapter.id || '').trim();
}

function findSeries(seriesId, series, seriesList = []) {
  if (series?.id === seriesId || series?.slug === seriesId) return series;
  return seriesList.find((item) => item?.id === seriesId || item?.slug === seriesId) || null;
}

export function resolveContinueHref({ seriesId = '', chapterId = '', series = null, seriesList = [] } = {}) {
  const currentSeries = findSeries(seriesId, series, seriesList);
  if (!currentSeries) return '';
  const chapters = Array.isArray(currentSeries.chapters) ? currentSeries.chapters : [];
  const chapter = chapters.find((item) => item.id === chapterId || item.slug === chapterId) || chapters[0] || null;
  const seriesSlug = String(currentSeries.slug || '').trim();
  const chapterSegment = chapterHrefSegment(chapter) || String(chapterId || '').trim();
  if (!seriesSlug || !chapterSegment) return '';
  return `/truyen/${seriesSlug}/${chapterSegment}`;
}

export async function resolveContinueHrefWithFallback({
  seriesId = '',
  chapterId = '',
  series = null,
  seriesList = [],
  fetchSeries = null
} = {}) {
  const href = resolveContinueHref({ seriesId, chapterId, series, seriesList });
  if (href || !seriesId || typeof fetchSeries !== 'function') return href;

  const fetchedSeries = await fetchSeries(seriesId);
  if (!fetchedSeries) return '';
  return resolveContinueHref({ seriesId, chapterId, series: fetchedSeries });
}
