import { hasReadableChapter } from './chapterState.mjs';

export function normalizeFilterText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function seriesSearchText(series = {}) {
  return normalizeFilterText([
    series.title,
    series.slug,
    ...(series.aliases || []),
    ...(series.tags || []).flatMap((tag) => [tag?.name || tag, tag?.slug || ''])
  ].join(' '));
}

function matchesTag(series, tagSlug) {
  if (!tagSlug || tagSlug === 'all') return true;
  return (series.tags || []).some((tag) => {
    const slug = tag?.slug || tag?.name || tag;
    return normalizeFilterText(slug) === normalizeFilterText(tagSlug);
  });
}

function readableCount(series) {
  if (Number.isFinite(Number(series.importedChapterCount))) return Number(series.importedChapterCount);
  return (series.chapters || []).filter(hasReadableChapter).length;
}

function totalChapterCount(series) {
  return Number(series.chapterCount || series.chapters?.length || 0);
}

function matchesStatus(series, status) {
  const readable = readableCount(series);
  const total = totalChapterCount(series);
  if (!status || status === 'all') return true;
  if (status === 'readable') return readable > 0;
  if (status === 'unreadable') return readable === 0;
  if (status === 'complete') return total > 0 && readable >= total;
  return true;
}

function sortValue(series, sort) {
  if (sort === 'updated') return Date.parse(series.updatedAt || series.createdAt || 0) || 0;
  if (sort === 'popular') return Number(series.stats?.views || series.views || 0);
  if (sort === 'chapters') return readableCount(series);
  return 0;
}

export function applySeriesFilters(seriesList = [], filters = {}) {
  const query = normalizeFilterText(filters.query || '');
  const sort = filters.sort || 'updated';
  const collator = new Intl.Collator('vi', { sensitivity: 'base' });

  const filtered = seriesList.filter((series) => {
    if (query && !seriesSearchText(series).includes(query)) return false;
    if (!matchesTag(series, filters.tag)) return false;
    return matchesStatus(series, filters.status);
  });

  return filtered.sort((a, b) => {
    if (sort === 'title') return collator.compare(a.title || '', b.title || '');
    const diff = sortValue(b, sort) - sortValue(a, sort);
    if (diff !== 0) return diff;
    return collator.compare(a.title || '', b.title || '');
  });
}

export function buildTagOptions(seriesList = []) {
  const map = new Map();
  for (const series of seriesList) {
    for (const tag of series.tags || []) {
      const slug = tag?.slug || normalizeFilterText(tag?.name || tag).replace(/\s+/g, '-');
      const name = tag?.name || String(tag || slug);
      if (!slug) continue;
      const current = map.get(slug) || { slug, name, count: 0 };
      current.count += 1;
      map.set(slug, current);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' }));
}
