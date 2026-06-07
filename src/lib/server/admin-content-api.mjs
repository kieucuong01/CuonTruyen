import { adminConfigStatus, isAdminAuthorized } from '../../../server/adminAuth.mjs';
import { listAnalyticsEvents, buildAnalyticsSummary } from '../../../server/analyticsStore.mjs';
import {
  readAdminCatalog,
  setStoredCrawlSchedule,
  updateStoredChapter,
  updateStoredSeries
} from '../../../server/contentStore.mjs';
import { readCatalog } from '../../../server/dataStore.mjs';
import { headersObjectFromNextRequest } from './node-api-adapter.mjs';

export function adminJsonApi({ status = 200, body } = {}) {
  return new Response(JSON.stringify(body ?? null), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export async function nextAdminContentAction(request, action) {
  const config = adminConfigStatus();
  if (!config.configured) {
    return {
      status: 503,
      body: { error: `Admin environment is not configured. Missing: ${config.missing.join(', ')}.` }
    };
  }
  if (!isAdminAuthorized(headersObjectFromNextRequest(request))) {
    return { status: 401, body: { error: 'Admin token is required.' } };
  }

  try {
    return await action({ config });
  } catch (error) {
    return {
      status: error.status || 500,
      body: { error: error.message || 'Admin content API failed.' }
    };
  }
}

export async function nextAdminContentCatalogApi(request) {
  return nextAdminContentAction(request, async () => ({
    status: 200,
    body: await readAdminCatalog()
  }));
}

export async function nextAdminContentEventsApi(request) {
  const url = new URL(request.url || 'https://local.test/');
  return nextAdminContentAction(request, async () => ({
    status: 200,
    body: {
      events: await listAnalyticsEvents({ limit: Number(url.searchParams.get('limit') || 200) })
    }
  }));
}

export async function nextAdminContentAnalyticsSummaryApi(request) {
  const url = new URL(request.url || 'https://local.test/');
  const range = url.searchParams.get('range') || '30d';
  return nextAdminContentAction(request, async () => ({
    status: 200,
    body: buildAnalyticsSummary({
      catalog: await readCatalog({ includePages: false }),
      events: await listAnalyticsEvents({ limit: Number(url.searchParams.get('limit') || 5000) }),
      range
    })
  }));
}

export async function nextAdminContentUpdateSeriesApi(request, seriesId) {
  return nextAdminContentAction(request, async () => {
    const result = await updateStoredSeries(seriesId, await readJsonBody(request));
    return {
      status: result.series ? 200 : 404,
      body: result.series || { error: 'Series not found' }
    };
  });
}

export async function nextAdminContentUpdateSeriesChapterApi(request, seriesId, chapterId) {
  return nextAdminContentAction(request, async () => {
    const result = await updateStoredChapter(seriesId, chapterId, await readJsonBody(request));
    return {
      status: result.chapter ? 200 : 404,
      body: result.chapter || { error: 'Chapter not found' }
    };
  });
}

export async function nextAdminContentUpdateChapterApi(request, chapterId) {
  return nextAdminContentAction(request, async () => {
    const body = await readJsonBody(request);
    let seriesId = String(body.seriesId || body.seriesSlug || '').trim();
    if (!seriesId) {
      const catalog = await readAdminCatalog();
      const owner = (catalog.series || []).find((series) => (
        Array.isArray(series.chapters)
        && series.chapters.some((chapter) => chapter.id === chapterId || chapter.slug === chapterId)
      ));
      seriesId = owner?.id || owner?.slug || '';
    }
    if (!seriesId) {
      return { status: 400, body: { error: 'seriesId is required to update this chapter.' } };
    }
    const result = await updateStoredChapter(seriesId, chapterId, body);
    return {
      status: result.chapter ? 200 : 404,
      body: result.chapter || { error: 'Chapter not found' }
    };
  });
}

export async function nextAdminContentCrawlScheduleApi(request, seriesId) {
  return nextAdminContentAction(request, async () => {
    const result = await setStoredCrawlSchedule(seriesId, await readJsonBody(request));
    return {
      status: result.series ? 200 : 404,
      body: result.series || { error: 'Series not found' }
    };
  });
}

async function readJsonBody(request) {
  const raw = await request.text();
  return raw.trim() ? JSON.parse(raw) : {};
}
