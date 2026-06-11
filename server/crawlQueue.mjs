import {
  ASSET_MODE_IMAGE_URL,
  IMPORT_MODE_NEW_CHAPTERS,
  IMPORT_MODE_REFRESH_IMAGE_URLS,
  normalizeAssetMode,
  normalizeImportMode
} from './importOptions.mjs';

export const ACTIVE_JOB_STATUSES = new Set(['queued', 'running', 'retrying']);

export function normalizeSourceUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.hash = '';
    url.hostname = url.hostname.replace(/^www\./, '');
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.href;
  } catch {
    return raw.replace(/#.*$/u, '').replace(/\/+$/u, '');
  }
}

export function buildInitialProgress(payload = {}, now = new Date().toISOString()) {
  const totalSeries = Math.max(1, Number(payload.totalSeries || 1));
  const seriesIndex = Math.max(1, Number(payload.seriesIndex || 1));
  const mode = normalizeImportMode(payload.mode);
  return {
    phase: 'queued',
    message: 'Đã xếp hàng crawl. Server sẽ tự xử lý job này.',
    totalSeries,
    processedSeries: Math.min(totalSeries, seriesIndex - 1),
    seriesIndex,
    currentSeriesUrl: String(payload.url || ''),
    mode,
    assetMode: mode === IMPORT_MODE_REFRESH_IMAGE_URLS ? ASSET_MODE_IMAGE_URL : normalizeAssetMode(payload.assetMode),
    totalChapters: 0,
    processedChapters: 0,
    totalImages: 0,
    downloadedImages: 0,
    currentChapterLabel: '',
    errors: [],
    errorCount: 0,
    startedAt: now,
    updatedAt: now
  };
}

export function createQueuedImportJob(payload = {}, {
  id = nextJobId(),
  now = new Date().toISOString(),
  priority = 0,
  reason = payload.reason || 'manual'
} = {}) {
  const sourceUrl = normalizeSourceUrl(payload.url);
  const assetMode = normalizeAssetMode(payload.assetMode);
  const mode = normalizeImportMode(payload.mode);
  return {
    id,
    sourceUrl,
    adapter: payload.adapter || '',
    status: 'queued',
    payload: {
      ...payload,
      url: sourceUrl,
      assetMode: mode === IMPORT_MODE_REFRESH_IMAGE_URLS ? ASSET_MODE_IMAGE_URL : assetMode,
      mode
    },
    progress: buildInitialProgress({
      ...payload,
      url: sourceUrl,
      assetMode: mode === IMPORT_MODE_REFRESH_IMAGE_URLS ? ASSET_MODE_IMAGE_URL : assetMode,
      mode
    }, now),
    logs: [],
    result: null,
    series: null,
    error: null,
    reason,
    priority: Number(priority || payload.priority || 0),
    attempts: 0,
    maxAttempts: Math.max(1, Number(payload.maxAttempts || process.env.CRAWL_JOB_MAX_ATTEMPTS || 3)),
    runAfter: now,
    lockedBy: null,
    lockedAt: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null
  };
}

export function shouldReuseActiveJob(job, url) {
  return Boolean(
    job
    && ACTIVE_JOB_STATUSES.has(job.status)
    && normalizeSourceUrl(job.sourceUrl || job.payload?.url) === normalizeSourceUrl(url)
  );
}

export function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    payload: job.payload,
    progress: job.progress,
    series: job.series || job.result?.series || null,
    result: job.result || null,
    error: job.error || job.lastError || null,
    logs: Array.isArray(job.logs) ? job.logs.slice(-25) : [],
    attempts: Number(job.attempts || 0),
    maxAttempts: Number(job.maxAttempts || 1),
    runAfter: job.runAfter,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt
  };
}

export function mergeProgress(job, patch = {}, now = new Date().toISOString()) {
  const previousErrors = Array.isArray(job.progress?.errors) ? job.progress.errors : [];
  const nextErrors = Array.isArray(patch.errors) ? patch.errors : previousErrors;
  return {
    ...(job.progress || {}),
    ...patch,
    errors: nextErrors.slice(-20),
    errorCount: Number(patch.errorCount ?? nextErrors.length ?? job.progress?.errorCount ?? 0),
    updatedAt: now
  };
}

export function selectScheduledSeries(catalog = {}, {
  now = Date.now(),
  hotAuto = process.env.CRAWL_HOT_AUTO === 'true',
  hotMinScore = Number(process.env.CRAWL_HOT_MIN_SCORE || 1000),
  hotLimit = Number(process.env.CRAWL_HOT_LIMIT || 10)
} = {}) {
  const selected = new Map();
  const seriesList = Array.isArray(catalog.series) ? catalog.series : [];
  const hotCandidates = hotAuto
    ? seriesList
      .filter((series) => sourceUrlForSeries(series) && hotScore(series) >= hotMinScore && isScheduleDue(series, now))
      .sort((a, b) => hotScore(b) - hotScore(a))
      .slice(0, Math.max(0, hotLimit))
      .map((series) => ({ series, reason: 'hot', score: hotScore(series) }))
    : [];
  const scheduledCandidates = seriesList
    .filter((series) => sourceUrlForSeries(series) && series.crawlSchedule?.enabled && isScheduleDue(series, now))
    .map((series) => ({ series, reason: 'schedule', score: hotScore(series) }));

  for (const candidate of [...hotCandidates, ...scheduledCandidates]) {
    if (!selected.has(candidate.series.id)) selected.set(candidate.series.id, candidate);
  }
  return [...selected.values()];
}

export function sourceUrlForSeries(series = {}) {
  return series.sourceUrl || series.sourceMappings?.find((mapping) => mapping.sourceUrl)?.sourceUrl || '';
}

function numberOrZero(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function createUpdateChaptersPayload(series = {}, options = {}) {
  const url = sourceUrlForSeries(series);
  return {
    url,
    seriesId: series.id,
    mode: IMPORT_MODE_NEW_CHAPTERS,
    assetMode: normalizeAssetMode(options.assetMode || series.importMode),
    publishNewChapters: options.publishNewChapters ?? true,
    maxChapters: numberOrZero(options.maxChapters),
    maxPages: numberOrZero(options.maxPages),
    reason: options.reason || 'manual-update',
    priority: Number(options.priority ?? 5),
    totalSeries: options.totalSeries,
    seriesIndex: options.seriesIndex
  };
}

export function createRefreshImageUrlsPayload(series = {}, options = {}) {
  const url = sourceUrlForSeries(series);
  return {
    url,
    seriesId: series.id,
    mode: IMPORT_MODE_REFRESH_IMAGE_URLS,
    assetMode: ASSET_MODE_IMAGE_URL,
    publishNewChapters: options.publishNewChapters ?? true,
    maxChapters: numberOrZero(options.maxChapters),
    maxPages: numberOrZero(options.maxPages),
    reason: options.reason || 'manual-refresh-image-urls',
    priority: Number(options.priority ?? 6),
    totalSeries: options.totalSeries,
    seriesIndex: options.seriesIndex
  };
}

export function createScheduledCrawlPayloads(candidates = [], options = {}) {
  return candidates.map(({ series, reason }, index) => {
    const schedule = series.crawlSchedule || {};
    return createUpdateChaptersPayload(series, {
      maxChapters: schedule.maxChapters ?? process.env.CRAWL_SCHEDULE_MAX_CHAPTERS ?? 0,
      maxPages: schedule.maxPages ?? process.env.CRAWL_SCHEDULE_MAX_PAGES ?? 0,
      reason,
      priority: reason === 'hot' ? 10 : 5,
      totalSeries: candidates.length,
      seriesIndex: index + 1,
      publishNewChapters: options.publishNewChapters ?? true
    });
  });
}

export function nextRetryAt({ attempts = 1, baseDelayMs = Number(process.env.CRAWL_JOB_RETRY_DELAY_MS || 60_000) } = {}, now = Date.now()) {
  const delay = Math.max(1, Number(baseDelayMs || 60_000)) * Math.max(1, Number(attempts || 1));
  return new Date(now + delay).toISOString();
}

function isScheduleDue(series, now) {
  const schedule = series.crawlSchedule || {};
  const intervalMs = Math.max(1, Number(schedule.intervalHours || 24)) * 60 * 60 * 1000;
  const lastQueuedAt = Date.parse(schedule.lastQueuedAt || series.updatedAt || series.importedAt || 0);
  return !lastQueuedAt || now - lastQueuedAt >= intervalMs;
}

function hotScore(series) {
  const stats = series.stats || {};
  return Number(stats.views || 0)
    + Number(stats.follows || 0) * 20
    + Number(stats.readDepth || 0) * 2
    + Number(stats.adViews || 0) * 0.2;
}

function nextJobId() {
  return `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
