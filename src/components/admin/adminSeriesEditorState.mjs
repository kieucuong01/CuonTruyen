const ORIGIN_TAG_OPTIONS = [
  { value: '', tags: [] },
  { value: 'manhwa', tags: ['Manhwa', 'Truyện Hàn'] },
  { value: 'manhua', tags: ['Manhua', 'Truyện Trung'] }
];

export function findAdminSeriesForEditor(catalog = {}, seriesId = '') {
  const key = String(seriesId || '').trim();
  if (!key) return null;
  return (catalog.series || []).find((series) => (
    String(series.id || '') === key || String(series.slug || '') === key
  )) || null;
}

export function buildAdminSeriesPatch(form = {}, { includeCrawlSchedule = true } = {}) {
  const patch = {
    title: trim(form.title),
    slug: trim(form.slug),
    coverUrl: trim(form.coverUrl),
    aliases: splitList(form.aliases),
    tags: mergeTagsWithOrigin(splitList(form.tags), form.originType),
    description: trim(form.description),
    status: normalizeStatus(form.status)
  };

  if (includeCrawlSchedule) {
    patch.crawlSchedule = buildCrawlSchedulePatch(form);
  }

  return patch;
}

export function buildCrawlSchedulePatch(form = {}) {
  return {
    enabled: Boolean(form.scheduleEnabled),
    intervalHours: Math.max(1, Number(form.intervalHours || 24) || 24)
  };
}

export function buildAdminChapterPatch(chapterId, form = {}) {
  const title = trim(form[`chapterTitle:${chapterId}`]);
  return {
    title,
    label: title,
    status: normalizeStatus(form[`chapterStatus:${chapterId}`]),
    takedownReason: trim(form[`chapterReason:${chapterId}`])
  };
}

export function formStateFromSeries(series = {}) {
  const tagNames = getSeriesTagNames(series);
  const schedule = series.crawlSchedule || {};
  return {
    title: series.title || '',
    slug: series.slug || '',
    coverUrl: series.coverUrl || series.thumbnailUrl || '',
    aliases: (series.aliases || []).join(', '),
    tags: tagNames.filter((tag) => !isOriginTagName(tag)).join(', '),
    originType: detectOriginType(tagNames),
    description: series.description || '',
    status: normalizeStatus(series.status),
    scheduleEnabled: Boolean(schedule.enabled),
    intervalHours: String(Number(schedule.intervalHours || 24))
  };
}

export function detectOriginType(tags = []) {
  const normalized = new Set(tags.map((tag) => normalizeAdminTagName(tag)));
  if (normalized.has('manhua') || normalized.has('truyen-trung')) return 'manhua';
  if (normalized.has('manhwa') || normalized.has('truyen-han')) return 'manhwa';
  return '';
}

export function getSeriesTagNames(series = {}) {
  return (series.tags || [])
    .map((tag) => trim(typeof tag === 'string' ? tag : tag?.name || tag?.slug || ''))
    .filter(Boolean);
}

export function mergeTagsWithOrigin(tags = [], originType = '') {
  const option = ORIGIN_TAG_OPTIONS.find((item) => item.value === originType) || ORIGIN_TAG_OPTIONS[0];
  return uniqueTagNames([
    ...(tags || []).filter((tag) => !isOriginTagName(tag)),
    ...option.tags
  ]);
}

export function chapterEditorRows(series = {}) {
  return (Array.isArray(series.chapters) ? series.chapters : []).map((chapter) => ({
    id: chapter.id || chapter.slug || '',
    title: chapter.title || chapter.label || '',
    status: normalizeStatus(chapter.status || (Number(chapter.pageCount || 0) > 0 ? 'public' : 'draft')),
    takedownReason: chapter.takedownReason || '',
    pageCount: Number(chapter.pageCount || (Array.isArray(chapter.pages) ? chapter.pages.length : 0)),
    href: series.slug && (chapter.slug || chapter.id)
      ? `/truyen/${encodeURIComponent(series.slug)}/${encodeURIComponent(chapter.slug || chapter.id)}`
      : ''
  })).filter((chapter) => chapter.id);
}

function uniqueTagNames(tags = []) {
  const seen = new Set();
  const unique = [];
  for (const tag of tags) {
    const name = trim(tag);
    const key = normalizeAdminTagName(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  return unique;
}

function isOriginTagName(tag = '') {
  return ['manhwa', 'manhua', 'truyen-han', 'truyen-trung'].includes(normalizeAdminTagName(tag));
}

function normalizeAdminTagName(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeStatus(status = '') {
  const value = String(status || '').trim();
  return ['public', 'draft', 'removed'].includes(value) ? value : 'draft';
}

function splitList(value = '') {
  if (Array.isArray(value)) return value.map(trim).filter(Boolean);
  return String(value || '').split(',').map(trim).filter(Boolean);
}

function trim(value = '') {
  return String(value || '').trim();
}
