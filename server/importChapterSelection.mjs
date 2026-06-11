import { normalizeSourceUrl } from './crawlQueue.mjs';
import { slugify } from './utils.mjs';

function chapterKeys(chapter = {}) {
  return [
    chapter.id,
    chapter.slug,
    slugify(chapter.label || chapter.title || '')
  ].map((value) => String(value || '').trim()).filter(Boolean);
}

function chapterSourceUrl(chapter = {}) {
  return normalizeSourceUrl(chapter.sourceUrl || chapter.url || '');
}

export function sourceIdentityKey(url = '') {
  try {
    const parsed = new URL(normalizeSourceUrl(url));
    return parsed.pathname.replace(/\/$/, '').toLowerCase();
  } catch {
    return '';
  }
}

export function sourceMappingsWith(series = {}, adapterName = '', sourceUrl = '') {
  const mappings = [
    ...(Array.isArray(series.sourceMappings) ? series.sourceMappings : []),
    series.sourceUrl ? { adapter: series.adapter || adapterName, sourceUrl: series.sourceUrl } : null,
    sourceUrl ? { adapter: adapterName, sourceUrl } : null
  ].filter((mapping) => mapping?.sourceUrl);
  const seen = new Set();
  return mappings.filter((mapping) => {
    const key = `${mapping.adapter || ''}:${normalizeSourceUrl(mapping.sourceUrl)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function findExistingSeriesForImport(catalog = {}, parsed = {}, sourceUrl = '') {
  const sourceKey = sourceIdentityKey(sourceUrl);
  const parsedSlug = String(parsed.slug || slugify(parsed.title || '')).trim();
  return (catalog.series || []).find((series) => {
    if (parsedSlug && series.slug === parsedSlug) return true;
    return sourceKey && sourceMappingsWith(series).some((mapping) => sourceIdentityKey(mapping.sourceUrl) === sourceKey);
  }) || null;
}

export function selectNewChaptersForImport(parsedChapters = [], existingChapters = []) {
  const existingUrls = new Set(
    existingChapters
      .map(chapterSourceUrl)
      .filter(Boolean)
  );
  const existingKeys = new Set(existingChapters.flatMap(chapterKeys));
  const chapters = parsedChapters.filter((chapter) => {
    const url = chapterSourceUrl(chapter);
    if (url && existingUrls.has(url)) return false;
    return !chapterKeys(chapter).some((key) => existingKeys.has(key));
  });
  return {
    chapters,
    skippedExistingChapterCount: parsedChapters.length - chapters.length
  };
}

export function selectRefreshImageUrlChapters(parsedChapters = [], existingChapters = []) {
  const usedExistingIds = new Set();
  const chapters = parsedChapters.map((parsedChapter) => {
    const existingChapter = findExistingChapterForParsed(parsedChapter, existingChapters, usedExistingIds);
    if (!existingChapter) return parsedChapter;
    usedExistingIds.add(existingChapter.id);
    return {
      ...parsedChapter,
      id: existingChapter.id || parsedChapter.id,
      slug: existingChapter.slug || parsedChapter.slug,
      label: existingChapter.label || existingChapter.title || parsedChapter.label,
      title: existingChapter.title || existingChapter.label || parsedChapter.title,
      sourceOrder: parsedChapter.sourceOrder ?? existingChapter.sourceOrder
    };
  });
  const refreshedExistingChapterCount = chapters.filter((chapter) => usedExistingIds.has(chapter.id)).length;
  return {
    chapters,
    refreshedExistingChapterCount,
    newChapterCount: chapters.length - refreshedExistingChapterCount
  };
}

function findExistingChapterForParsed(parsedChapter = {}, existingChapters = [], usedExistingIds = new Set()) {
  const parsedUrl = chapterSourceUrl(parsedChapter);
  if (parsedUrl) {
    const byUrl = existingChapters.find((chapter) => (
      !usedExistingIds.has(chapter.id)
      && chapterSourceUrl(chapter)
      && chapterSourceUrl(chapter) === parsedUrl
    ));
    if (byUrl) return byUrl;
  }
  const parsedKeys = new Set(chapterKeys(parsedChapter));
  return existingChapters.find((chapter) => (
    !usedExistingIds.has(chapter.id)
    && chapterKeys(chapter).some((key) => parsedKeys.has(key))
  )) || null;
}
