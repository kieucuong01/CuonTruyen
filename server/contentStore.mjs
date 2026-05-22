import { readCatalog, writeCatalog } from './catalogStore.mjs';
import { slugify, uniqueBy } from './utils.mjs';

const PUBLIC_STATUS = 'public';

export function normalizeTag(tag) {
  const name = typeof tag === 'string' ? tag : tag?.name;
  const slug = typeof tag === 'string' ? slugify(tag) : tag?.slug || slugify(name || 'tag');
  return {
    name: String(name || slug).trim(),
    slug
  };
}

export function normalizeTags(tags = []) {
  return uniqueBy(
    tags
      .map(normalizeTag)
      .filter((tag) => tag.name && tag.slug),
    (tag) => tag.slug
  );
}

export function normalizeChapter(chapter = {}) {
  const label = chapter.label || chapter.title || chapter.id || 'Chapter';
  const slug = chapter.slug || slugify(label);
  const pages = (chapter.pages || []).map((page, index) => ({
    ...page,
    order: Number(page.order ?? page.index ?? index),
    imageUrl: page.imageUrl || page.src || page.sourceUrl || '',
    storageKey: page.storageKey || page.src || page.imageUrl || '',
    width: page.width || null,
    height: page.height || null
  }));
  return {
    ...chapter,
    title: chapter.title || label,
    label,
    slug,
    status: chapter.status || (chapter.imported || pages.length > 0 ? PUBLIC_STATUS : 'draft'),
    pageCount: Number(chapter.pageCount ?? pages.length),
    pages
  };
}

export function normalizeSeries(series = {}) {
  const title = series.title || 'Truyen tranh';
  const chapters = (series.chapters || []).map(normalizeChapter);
  const coverUrl = series.coverUrl || series.cover || '';
  const autoPublic = Boolean(title && coverUrl && chapters.some((chapter) => chapter.pages.length > 0));
  return {
    ...series,
    title,
    slug: series.slug || slugify(title),
    aliases: uniqueBy((series.aliases || []).filter(Boolean).map((value) => String(value).trim())),
    description: series.description || '',
    status: series.status || (autoPublic ? PUBLIC_STATUS : 'draft'),
    coverUrl,
    tags: normalizeTags(series.tags || []),
    stats: {
      views: 0,
      follows: 0,
      readDepth: 0,
      adViews: 0,
      ...(series.stats || {})
    },
    sourceMappings: series.sourceMappings || [
      {
        adapter: series.adapter || '',
        sourceUrl: series.sourceUrl || ''
      }
    ].filter((item) => item.sourceUrl),
    crawlSchedule: series.crawlSchedule || {
      enabled: false,
      intervalHours: 24
    },
    chapters
  };
}

export function publicSeries(series) {
  const normalized = normalizeSeries(series);
  return {
    id: normalized.id,
    title: normalized.title,
    aliases: normalized.aliases,
    slug: normalized.slug,
    coverUrl: normalized.coverUrl,
    description: normalized.description,
    status: normalized.status,
    sourceMappings: normalized.sourceMappings,
    tags: normalized.tags,
    stats: normalized.stats,
    crawlSchedule: normalized.crawlSchedule,
    importedAt: normalized.importedAt,
    updatedAt: normalized.updatedAt,
    chapters: normalized.chapters
  };
}

export function publicCatalog(catalog) {
  return {
    series: (catalog.series || []).map(publicSeries)
  };
}

export function findSeriesBySlug(catalog, slugOrId, { includeDraft = false } = {}) {
  const target = String(slugOrId || '').trim();
  const series = (catalog.series || [])
    .map(normalizeSeries)
    .find((item) => item.id === target || item.slug === target);
  if (!series) return null;
  if (!includeDraft && series.status !== PUBLIC_STATUS) return null;
  return publicSeries(series);
}

export function findChapterBySlug(series, chapterSlug) {
  const target = String(chapterSlug || '').trim();
  return (series?.chapters || [])
    .map(normalizeChapter)
    .find((chapter) => chapter.id === target || chapter.slug === target) || null;
}

export function buildTagIndex(catalog) {
  const tags = new Map();
  for (const series of (catalog.series || []).map(normalizeSeries)) {
    if (series.status !== PUBLIC_STATUS) continue;
    for (const tag of series.tags) {
      const previous = tags.get(tag.slug) || { ...tag, seriesCount: 0 };
      previous.seriesCount += 1;
      tags.set(tag.slug, previous);
    }
  }
  return [...tags.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export function buildTagPage(catalog, tagSlug) {
  const series = (catalog.series || [])
    .map(normalizeSeries)
    .filter((item) => item.status === PUBLIC_STATUS && item.tags.some((tag) => tag.slug === tagSlug))
    .map(publicSeries);
  const tag = buildTagIndex(catalog).find((item) => item.slug === tagSlug) || null;
  return tag ? { tag, series } : null;
}

export function buildHomeCollections(catalog) {
  const series = (catalog.series || [])
    .map(normalizeSeries)
    .filter((item) => item.status === PUBLIC_STATUS)
    .map(publicSeries);
  const score = (item) => {
    const updated = item.updatedAt ? Date.parse(item.updatedAt) / 1000 / 60 / 60 / 24 : 0;
    return Number(item.stats.views || 0) + Number(item.stats.follows || 0) * 20 + updated / 30;
  };
  return {
    hot: [...series].sort((a, b) => score(b) - score(a)).slice(0, 12),
    updated: [...series].sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0)).slice(0, 12),
    tags: buildTagIndex(catalog)
  };
}

export function searchCatalog(catalog, query) {
  const needle = slugify(query || '');
  if (!needle) return [];
  return (catalog.series || [])
    .map(normalizeSeries)
    .filter((series) => {
      if (series.status !== PUBLIC_STATUS) return false;
      const haystack = [
        series.title,
        series.slug,
        ...series.aliases,
        ...series.tags.map((tag) => tag.name)
      ].map(slugify).join(' ');
      return haystack.includes(needle);
    })
    .map(publicSeries);
}

export function updateSeriesInCatalog(catalog, id, patch = {}) {
  const index = (catalog.series || []).findIndex((item) => item.id === id || item.slug === id);
  if (index < 0) {
    return { catalog, series: null };
  }
  const current = normalizeSeries(catalog.series[index]);
  const next = normalizeSeries({
    ...current,
    ...pickDefined({
      title: patch.title,
      slug: patch.slug ? slugify(patch.slug) : undefined,
      description: patch.description,
      status: patch.status,
      coverUrl: patch.coverUrl,
      aliases: Array.isArray(patch.aliases) ? patch.aliases : splitList(patch.aliases),
      tags: Array.isArray(patch.tags) ? patch.tags : splitList(patch.tags),
      crawlSchedule: patch.crawlSchedule || patch.schedule
    }),
    chapters: current.chapters,
    updatedAt: new Date().toISOString()
  });
  const nextCatalog = {
    ...catalog,
    series: [...(catalog.series || [])]
  };
  nextCatalog.series[index] = next;
  return { catalog: nextCatalog, series: publicSeries(next) };
}

export function recordEventOnCatalog(catalog, event = {}) {
  const series = findSeriesBySlug(catalog, event.seriesSlug || event.seriesId, { includeDraft: true });
  if (!series) return { catalog, series: null };
  const index = (catalog.series || []).findIndex((item) => item.id === series.id);
  const current = normalizeSeries(catalog.series[index]);
  const stats = { ...current.stats };
  if (event.type === 'pageview') stats.views = Number(stats.views || 0) + 1;
  if (event.type === 'follow') stats.follows = Number(stats.follows || 0) + 1;
  if (event.type === 'read_depth') stats.readDepth = Math.max(Number(stats.readDepth || 0), Number(event.value || 0));
  if (event.type === 'ad_view' || event.type === 'ad_impression') stats.adViews = Number(stats.adViews || 0) + 1;
  const next = normalizeSeries({
    ...current,
    stats,
    updatedAt: new Date().toISOString()
  });
  const nextCatalog = {
    ...catalog,
    series: [...(catalog.series || [])]
  };
  nextCatalog.series[index] = next;
  return { catalog: nextCatalog, series: publicSeries(next) };
}

export async function readPublicCatalog() {
  return publicCatalog(await readCatalog());
}

export async function updateStoredSeries(id, patch) {
  const result = updateSeriesInCatalog(await readCatalog(), id, patch);
  if (!result.series) return result;
  await writeCatalog(result.catalog);
  return result;
}

export async function setStoredCrawlSchedule(id, crawlSchedule) {
  return updateStoredSeries(id, { crawlSchedule });
}

export async function recordStoredEvent(event) {
  const result = recordEventOnCatalog(await readCatalog(), event);
  if (!result.series) return result;
  await writeCatalog(result.catalog);
  return result;
}

function pickDefined(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

function splitList(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
