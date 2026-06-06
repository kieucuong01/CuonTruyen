const DEFAULT_TIMEOUT_MS = 12_000;

function trimTrailingSlash(value = '') {
  return String(value || '').replace(/\/$/, '');
}

function firstValue(...values) {
  return values.map((value) => String(value || '').trim()).find(Boolean) || '';
}

export function firstReadableChapter(series = {}) {
  const readableChapters = (series.chapters || []).filter((chapter) => {
    const status = String(chapter.status || series.status || 'public');
    const pages = Array.isArray(chapter.pages) ? chapter.pages : [];
    return status === 'public' && pages.length > 0;
  });
  return readableChapters.find((chapter) => String(chapter.slug || '').trim()) || readableChapters[0] || null;
}

export function firstPageUrl(chapter = {}) {
  const page = Array.isArray(chapter.pages) ? chapter.pages[0] : null;
  if (!page) return '';
  if (typeof page === 'string') return page;
  return firstValue(page.imageUrl, page.src, page.url, page.storageKey);
}

export function resolveProductionAssetUrl(value = '', {
  productionBaseUrl = '',
  importsBaseUrl = ''
} = {}) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).toString();
  } catch {}

  if (raw.startsWith('/imports/') && importsBaseUrl) {
    const base = trimTrailingSlash(importsBaseUrl);
    const suffix = raw.slice('/imports/'.length);
    return base.endsWith('/imports')
      ? `${base}/${suffix}`
      : `${base}/imports/${suffix}`;
  }

  if (raw.startsWith('/')) {
    const base = trimTrailingSlash(productionBaseUrl);
    return base ? `${base}${raw}` : raw;
  }

  return raw;
}

export function buildProductionCheckTargets({
  series = {},
  productionUrl = '',
  productionBaseUrl = '',
  importsBaseUrl = '',
  staticApiBaseUrl = ''
} = {}) {
  const targets = [];
  const seriesSlug = String(series.slug || '').trim();
  const chapter = firstReadableChapter(series);
  const chapterSlug = String(chapter?.slug || chapter?.id || '').trim();
  const baseUrl = trimTrailingSlash(productionBaseUrl || productionUrl.replace(/\/truyen\/.*$/, ''));
  const staticBase = trimTrailingSlash(staticApiBaseUrl);

  if (productionUrl) {
    targets.push({
      key: 'series-page',
      label: 'Trang truyện production',
      kind: 'html',
      required: true,
      url: productionUrl
    });
  }

  const coverUrl = resolveProductionAssetUrl(firstValue(
    series.thumbnailUrl,
    series.coverThumbnailUrl,
    series.coverUrl,
    series.imageUrl
  ), { productionBaseUrl: baseUrl, importsBaseUrl });
  if (coverUrl) {
    targets.push({
      key: 'cover-image',
      label: 'Ảnh cover',
      kind: 'image',
      required: true,
      url: coverUrl
    });
  }

  const chapterImageUrl = resolveProductionAssetUrl(firstPageUrl(chapter), {
    productionBaseUrl: baseUrl,
    importsBaseUrl
  });
  if (chapterImageUrl) {
    targets.push({
      key: 'chapter-image',
      label: 'Ảnh trang truyện',
      kind: 'image',
      required: true,
      url: chapterImageUrl
    });
  }

  if (staticBase && seriesSlug) {
    targets.push({
      key: 'static-series-api',
      label: 'Static API truyện',
      kind: 'json',
      required: true,
      url: `${staticBase}/series/${encodeURIComponent(seriesSlug)}.json`
    });
  }

  if (staticBase && seriesSlug && chapterSlug) {
    targets.push({
      key: 'static-reader-api',
      label: 'Static API reader',
      kind: 'json',
      required: true,
      url: `${staticBase}/reader/${encodeURIComponent(seriesSlug)}/${encodeURIComponent(chapterSlug)}.json`
    });
  }

  return targets;
}

export async function checkProductionTargets(targets = [], {
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const checks = [];
  for (const target of targets) {
    checks.push(await checkOneTarget(target, { fetchImpl, timeoutMs }));
  }
  return {
    ok: checks.every((check) => check.ok || !check.required),
    checks
  };
}

async function checkOneTarget(target, { fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(target.url, {
      method: 'GET',
      headers: target.kind === 'image' ? { range: 'bytes=0-0' } : {},
      signal: controller.signal
    });
    const contentType = response.headers?.get?.('content-type') || '';
    const ok = response.ok || (target.kind === 'image' && response.status === 206);
    return {
      ...target,
      ok,
      status: response.status,
      contentType,
      error: ok ? '' : `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      ...target,
      ok: false,
      status: 0,
      contentType: '',
      error: error?.name === 'AbortError' ? 'Timeout' : error?.message || 'Fetch failed'
    };
  } finally {
    clearTimeout(timeout);
  }
}
