import { publicImportUrl } from './catalogStore.mjs';
import { readCatalog, writeCatalog } from './dataStore.mjs';
import { slugify, uniqueBy } from './utils.mjs';

const PUBLIC_STATUS = 'public';
const HIDDEN_STATUSES = new Set(['draft', 'removed']);

export const SEO_FEATURED_TAGS = [
  {
    slug: 'manhwa',
    name: 'Truyện Manhwa',
    aliases: ['manhwa', 'truyen-han', 'truyen-han-quoc', 'han-quoc', 'han']
  },
  {
    slug: 'manhua',
    name: 'Truyện Manhua',
    aliases: ['manhua', 'truyen-trung', 'truyen-trung-quoc', 'trung-quoc', 'trung']
  },
  {
    slug: 'manga',
    name: 'Truyện Manga',
    aliases: ['manga', 'truyen-nhat', 'truyen-nhat-ban', 'nhat-ban', 'nhat']
  },
  {
    slug: 'truyen-han',
    name: 'Truyện Hàn',
    aliases: ['truyen-han', 'truyen-han-quoc', 'han-quoc', 'han', 'manhwa']
  },
  {
    slug: 'truyen-trung',
    name: 'Truyện Trung',
    aliases: ['truyen-trung', 'truyen-trung-quoc', 'trung-quoc', 'trung', 'manhua']
  },
  {
    slug: 'truyen-nhat',
    name: 'Truyện Nhật',
    aliases: ['truyen-nhat', 'truyen-nhat-ban', 'nhat-ban', 'nhat', 'manga']
  }
].map((tag) => ({
  ...tag,
  matchSlugs: new Set([tag.slug, ...tag.aliases].map((value) => slugify(value)).filter(Boolean))
}));

function isPublicStatus(status) {
  return String(status || '').trim() === PUBLIC_STATUS;
}

function shouldShowChapter(chapter, { includeHidden = false } = {}) {
  return includeHidden || isPublicStatus(chapterStatus(chapter));
}

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

function featuredTagForSlug(tagSlug) {
  const normalizedSlug = slugify(tagSlug || '');
  return SEO_FEATURED_TAGS.find((tag) => tag.slug === normalizedSlug) || null;
}

function tagIdentitySlugs(tag) {
  const normalized = normalizeTag(tag);
  return new Set([normalized.slug, slugify(normalized.name)].filter(Boolean));
}

function tagMatchesFeatured(tag, featuredTag) {
  for (const slug of tagIdentitySlugs(tag)) {
    if (featuredTag.matchSlugs.has(slug)) return true;
  }
  return false;
}

function seriesMatchesFeaturedTag(series, featuredTag) {
  return (series.tags || []).some((tag) => tagMatchesFeatured(tag, featuredTag));
}

function seriesMatchesTag(series, tagSlug) {
  const normalizedSlug = slugify(tagSlug || '');
  const featuredTag = featuredTagForSlug(normalizedSlug);
  if (featuredTag) return seriesMatchesFeaturedTag(series, featuredTag);
  return (series.tags || []).some((tag) => tag.slug === normalizedSlug);
}

function chapterLabel(chapter = {}) {
  return chapter.label || chapter.title || chapter.id || 'Chapter';
}

function getChapterSlug(chapter = {}) {
  const label = chapterLabel(chapter);
  const labelSlug = slugify(label);
  const idSlug = String(chapter.id || '').trim();
  const fallbackSlug = (labelSlug && labelSlug !== 'series' ? labelSlug : '') || idSlug || 'chapter';
  return chapter.slug && chapter.slug !== 'series' ? chapter.slug : fallbackSlug;
}

function rawPages(chapter = {}) {
  return Array.isArray(chapter.pages) ? chapter.pages : [];
}

function localImportPath(value = '') {
  const url = String(value || '');
  if (url.startsWith('/imports/')) return url;
  try {
    const parsed = new URL(url);
    const marker = '/imports/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex >= 0) return decodeURI(parsed.pathname.slice(markerIndex));
  } catch {
    return url;
  }
  return url;
}

export function sanitizeReaderPages(pages = []) {
  if (!Array.isArray(pages) || pages.length < 3) return Array.isArray(pages) ? pages : [];
  return pages.filter((page, index) => !isStandaloneBoundaryAdPage(page, index, pages.length));
}

function publicReaderPage(page = {}, index = 0) {
  const imageUrl = publicImportUrl(page.imageUrl || page.src || page.storageKey || page.sourceUrl || '');
  return {
    order: Number(page.order ?? page.index ?? index),
    imageUrl,
    width: page.width || null,
    height: page.height || null
  };
}

export function isStandaloneBoundaryAdPage(page = {}, index = 0, total = 0) {
  const isBoundary = index === 0 || index === total - 1;
  if (!isBoundary || total < 3) return false;

  const width = Number(page.width || 0);
  const height = Number(page.height || 0);
  if (!width || !height) return false;

  const aspect = height / width;
  return width >= 600 && height <= 620 && aspect <= 0.65;
}

function hasCachedPages(chapter = {}) {
  if (Array.isArray(chapter.pages)) return rawPages(chapter).length > 0;
  return Boolean(chapter.imported || Number(chapter.pageCount || 0) > 0);
}

function chapterStatus(chapter = {}) {
  return chapter.status || (chapter.imported || hasCachedPages(chapter) ? PUBLIC_STATUS : 'draft');
}

function seriesSlug(series = {}) {
  return series.slug || slugify(series.title || 'Truyện tranh');
}

function seriesSlugCandidates(series = {}) {
  return new Set([
    series.id,
    seriesSlug(series),
    ...(series.aliases || []).map((value) => slugify(value))
  ].filter(Boolean).map((value) => String(value).trim()));
}

function seriesMatchesSlug(series = {}, target = '') {
  const normalizedTarget = String(target || '').trim();
  if (!normalizedTarget) return false;
  const candidates = seriesSlugCandidates(series);
  return candidates.has(normalizedTarget) || candidates.has(slugify(normalizedTarget));
}

function seriesMeta(series = {}) {
  const title = series.title || 'Truyện tranh';
  const coverUrl = publicImportUrl(series.coverUrl || series.cover || '');
  const thumbnailUrl = publicImportUrl(series.thumbnailUrl || series.coverThumbnailUrl || '');
  const chapters = Array.isArray(series.chapters) ? series.chapters : [];
  const autoPublic = Boolean(title && (coverUrl || thumbnailUrl) && chapters.some(hasCachedPages));
  return {
    id: series.id,
    title,
    aliases: uniqueBy((series.aliases || []).filter(Boolean).map((value) => String(value).trim())),
    slug: seriesSlug({ ...series, title }),
    coverUrl,
    thumbnailUrl,
    coverThumbnail: series.coverThumbnail || null,
    description: series.description || '',
    status: series.status || (autoPublic ? PUBLIC_STATUS : 'draft'),
    sourceMappings: series.sourceMappings || [
      {
        adapter: series.adapter || '',
        sourceUrl: series.sourceUrl || ''
      }
    ].filter((item) => item.sourceUrl),
    tags: normalizeTags(series.tags || []),
    stats: {
      views: 0,
      follows: 0,
      readDepth: 0,
      adViews: 0,
      adClicks: 0,
      donateClicks: 0,
      ...(series.stats || {})
    },
    crawlSchedule: series.crawlSchedule || {
      enabled: false,
      intervalHours: 24
    },
    importedAt: series.importedAt,
    updatedAt: series.updatedAt
  };
}

export function normalizeChapter(chapter = {}) {
  const label = chapterLabel(chapter);
  const pages = rawPages(chapter).map((page, index) => {
    const imageUrl = publicImportUrl(page.imageUrl || page.src || page.sourceUrl || '');
    const storageKey = localImportPath(page.storageKey || page.src || page.imageUrl || '');
    return {
      ...page,
      order: Number(page.order ?? page.index ?? index),
      src: imageUrl || page.src || '',
      imageUrl,
      storageKey: storageKey || imageUrl || '',
      width: page.width || null,
      height: page.height || null
    };
  });
  return {
    ...chapter,
    title: chapter.title || label,
    label,
    slug: getChapterSlug(chapter),
    status: chapterStatus(chapter),
    pageCount: Number(chapter.pageCount ?? pages.length),
    pages
  };
}

export function normalizeSeries(series = {}) {
  const meta = seriesMeta(series);
  const chapters = (series.chapters || []).map(normalizeChapter);
  return {
    ...series,
    ...meta,
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

export function publicChapterSummary(chapter) {
  const label = chapterLabel(chapter);
  const hasPagesArray = Array.isArray(chapter.pages);
  const cachedPageCount = hasPagesArray
    ? rawPages(chapter).length
    : Number(chapter.pageCount || 0);
  const hasCachedPages = hasPagesArray
    ? cachedPageCount > 0
    : Boolean(chapter.imported || cachedPageCount > 0);
  return {
    id: chapter.id,
    title: chapter.title || label,
    label,
    slug: getChapterSlug(chapter),
    status: chapterStatus(chapter),
    imported: hasCachedPages,
    pageCount: hasCachedPages ? Number(chapter.pageCount || cachedPageCount) : 0,
    sourceOrder: chapter.sourceOrder ?? null,
    publishedAt: chapter.publishedAt,
    updatedAt: chapter.updatedAt
  };
}

export function publicReaderChapter(chapter) {
  const normalized = normalizeChapter(chapter);
  const pages = sanitizeReaderPages(normalized.pages).map(publicReaderPage);
  return {
    ...publicChapterSummary({ ...normalized, pages, pageCount: pages.length }),
    pages
  };
}

export function publicSeriesSummary(series, { chapterLimit = null } = {}) {
  const meta = seriesMeta(series);
  const allChapters = (series.chapters || [])
    .map(publicChapterSummary)
    .filter((chapter) => shouldShowChapter(chapter));
  const pageCount = allChapters.reduce((sum, chapter) => sum + Number(chapter.pageCount || 0), 0);
  const importedChapterCount = allChapters.filter((chapter) => chapter.imported || chapter.pageCount > 0).length;
  const chapters = chapterLimit === null
    ? allChapters
    : allChapters.filter((chapter) => chapter.imported || chapter.pageCount > 0).slice(0, chapterLimit);
  return {
    ...meta,
    chapterCount: allChapters.length,
    importedChapterCount,
    pageCount,
    chapters
  };
}

export function publicSeriesDetail(series) {
  return publicSeriesSummary(series);
}

export function publicReaderSeriesSummary(series) {
  const { chapters, ...summary } = publicSeriesSummary(series);
  return summary;
}

export function publicCatalog(catalog, { chapterLimit = null } = {}) {
  return {
    series: (catalog.series || [])
      .map((series) => publicSeriesSummary(series, { chapterLimit }))
      .filter((series) => isPublicStatus(series.status))
  };
}

export function adminCatalog(catalog) {
  return {
    series: (catalog.series || []).map((series) => {
      const meta = seriesMeta(series);
      const chapters = (series.chapters || []).map(publicChapterSummary);
      const pageCount = chapters.reduce((sum, chapter) => sum + Number(chapter.pageCount || 0), 0);
      const importedChapterCount = chapters.filter((chapter) => chapter.imported || chapter.pageCount > 0).length;
      return {
        ...meta,
        chapterCount: chapters.length,
        importedChapterCount,
        pageCount,
        chapters
      };
    })
  };
}

export function findSeriesBySlug(catalog, slugOrId, { includeDraft = false } = {}) {
  const target = String(slugOrId || '').trim();
  const series = (catalog.series || [])
    .find((item) => seriesMatchesSlug(item, target));
  if (!series) return null;
  const summary = publicSeriesDetail(series);
  if (!includeDraft && summary.status !== PUBLIC_STATUS) return null;
  return summary;
}

export function findChapterBySlug(series, chapterSlug, { includeHidden = false } = {}) {
  const target = String(chapterSlug || '').trim();
  return (series?.chapters || [])
    .map(normalizeChapter)
    .filter((chapter) => shouldShowChapter(chapter, { includeHidden }))
    .find((chapter) => chapter.id === target || chapter.slug === target) || null;
}

export function selectReaderChapterWindow(series, chapterSlug, { window = 0, start = 'current' } = {}) {
  const chapters = (series?.chapters || [])
    .filter((chapter) => isPublicStatus(chapterStatus(chapter)) && hasCachedPages(chapter))
    .map(normalizeChapter);
  const target = String(chapterSlug || '').trim();
  const targetIndex = chapters.findIndex((chapter) => chapter.id === target || getChapterSlug(chapter) === target);
  if (targetIndex < 0) return null;

  const startIndex = start === 'next' ? targetIndex + 1 : targetIndex;
  const chapter = chapters[startIndex];
  if (!chapter) return null;

  const windowSize = Math.max(0, Number(window || 0));
  const windowChapters = chapters.slice(startIndex, startIndex + windowSize + 1);

  return {
    chapters,
    targetIndex,
    startIndex,
    chapter,
    windowChapters,
    chapterIds: windowChapters.map((item) => item.id).filter(Boolean)
  };
}

export function buildReaderChapterPayload(catalog, seriesSlug, chapterSlug, { window = 0, start = 'current' } = {}) {
  const series = (catalog.series || [])
    .find((item) => seriesMatchesSlug(item, String(seriesSlug || '').trim()));
  if (!series || seriesMeta(series).status !== PUBLIC_STATUS) return null;

  const selection = selectReaderChapterWindow(series, chapterSlug, { window, start });
  if (!selection) return null;
  const { chapters, startIndex, chapter } = selection;
  const windowChapters = selection.windowChapters.map(publicReaderChapter);

  return {
    series: publicReaderSeriesSummary(series),
    chapter: publicReaderChapter(chapter),
    chapters: windowChapters,
    previousChapter: startIndex > 0 ? publicChapterSummary(chapters[startIndex - 1]) : null,
    nextChapter: startIndex + 1 < chapters.length ? publicChapterSummary(chapters[startIndex + 1]) : null
  };
}

export function buildTagIndex(catalog) {
  const tags = new Map();
  const publicSeries = [];
  for (const rawSeries of (catalog.series || [])) {
    const series = seriesMeta(rawSeries);
    if (series.status !== PUBLIC_STATUS) continue;
    publicSeries.push(series);
    for (const tag of series.tags) {
      const previous = tags.get(tag.slug) || { ...tag, seriesCount: 0 };
      previous.seriesCount += 1;
      tags.set(tag.slug, previous);
    }
  }
  for (const featuredTag of SEO_FEATURED_TAGS) {
    const seriesCount = publicSeries.filter((series) => seriesMatchesFeaturedTag(series, featuredTag)).length;
    if (!seriesCount) continue;
    tags.set(featuredTag.slug, {
      slug: featuredTag.slug,
      name: featuredTag.name,
      seriesCount
    });
  }
  return [...tags.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

export function buildTagPage(catalog, tagSlug) {
  const normalizedSlug = slugify(tagSlug || '');
  const series = (catalog.series || [])
    .filter((item) => {
      const meta = seriesMeta(item);
      return meta.status === PUBLIC_STATUS && seriesMatchesTag(meta, normalizedSlug);
    })
    .map((item) => publicSeriesSummary(item, { chapterLimit: 3 }));
  const tag = buildTagIndex(catalog).find((item) => item.slug === normalizedSlug) || null;
  return tag ? { tag, series } : null;
}

export function buildHomeCollections(catalog) {
  const series = (catalog.series || [])
    .filter((item) => seriesMeta(item).status === PUBLIC_STATUS)
    .map((item) => publicSeriesSummary(item, { chapterLimit: 3 }));
  const score = (item) => {
    const updatedAt = Date.parse(item.updatedAt || 0);
    const freshness = Number.isFinite(updatedAt) ? updatedAt / 1000 / 60 / 60 / 24 / 7 : 0;
    const views = Number(item.stats.views || 0);
    const follows = Number(item.stats.follows || 0);
    const readDepth = Number(item.stats.readDepth || 0);
    const libraryDepth = Math.log10(1 + Number(item.pageCount || 0)) * 8
      + Math.log10(1 + Number(item.importedChapterCount || item.chapterCount || 0)) * 12;
    return views + follows * 20 + readDepth * 0.2 + libraryDepth + freshness;
  };
  return {
    all: [...series].sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0)),
    hot: [...series].sort((a, b) => score(b) - score(a)).slice(0, 12),
    updated: [...series].sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0)).slice(0, 12),
    tags: buildTagIndex(catalog)
  };
}

export function searchCatalog(catalog, query) {
  const needle = slugify(query || '');
  if (!needle) return [];
  return (catalog.series || [])
    .filter((series) => {
      const meta = seriesMeta(series);
      if (meta.status !== PUBLIC_STATUS) return false;
      const haystack = [
        meta.title,
        meta.slug,
        ...meta.aliases,
        ...meta.tags.map((tag) => tag.name)
      ].map(slugify).join(' ');
      return haystack.includes(needle);
    })
    .map((series) => publicSeriesSummary(series, { chapterLimit: 3 }));
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
      thumbnailUrl: patch.thumbnailUrl,
      coverThumbnail: patch.coverThumbnail,
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

export function updateChapterInCatalog(catalog, seriesId, chapterId, patch = {}) {
  const seriesIndex = (catalog.series || []).findIndex((item) => item.id === seriesId || item.slug === seriesId);
  if (seriesIndex < 0) {
    return { catalog, series: null, chapter: null };
  }

  const current = normalizeSeries(catalog.series[seriesIndex]);
  const chapterIndex = current.chapters.findIndex((chapter) => chapter.id === chapterId || chapter.slug === chapterId);
  if (chapterIndex < 0) {
    return { catalog, series: publicSeries(current), chapter: null };
  }

  const currentChapter = current.chapters[chapterIndex];
  const status = patch.status && !HIDDEN_STATUSES.has(patch.status) && patch.status !== PUBLIC_STATUS
    ? currentChapter.status
    : patch.status;
  const nextChapter = normalizeChapter({
    ...currentChapter,
    ...pickDefined({
      title: patch.title,
      label: patch.label,
      slug: patch.slug ? slugify(patch.slug) : undefined,
      status,
      takedownReason: patch.takedownReason
    }),
    updatedAt: new Date().toISOString()
  });
  const chapters = [...current.chapters];
  chapters[chapterIndex] = nextChapter;
  const next = normalizeSeries({
    ...current,
    chapters,
    updatedAt: new Date().toISOString()
  });
  const nextCatalog = {
    ...catalog,
    series: [...(catalog.series || [])]
  };
  nextCatalog.series[seriesIndex] = next;
  return {
    catalog: nextCatalog,
    series: publicSeries(next),
    chapter: publicChapterSummary(nextChapter)
  };
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
  if (event.type === 'ad_click') stats.adClicks = Number(stats.adClicks || 0) + 1;
  if (event.type === 'donate_click') stats.donateClicks = Number(stats.donateClicks || 0) + 1;
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

export async function readPublicCatalog(options = {}) {
  return publicCatalog(await readCatalog({ includePages: false }), options);
}

export async function readAdminCatalog() {
  return adminCatalog(await readCatalog({ includePages: false }));
}

export async function updateStoredSeries(id, patch) {
  const result = updateSeriesInCatalog(await readCatalog(), id, patch);
  if (!result.series) return result;
  await writeCatalog(result.catalog);
  return result;
}

export async function updateStoredChapter(seriesId, chapterId, patch) {
  const result = updateChapterInCatalog(await readCatalog(), seriesId, chapterId, patch);
  if (!result.chapter) return result;
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
