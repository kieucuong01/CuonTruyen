import { createBoundedCache } from './cacheStore.mjs';
import { apiUrl, getRuntimeConfig } from './runtimeConfig.mjs';

export { apiUrl };

export function isCacheableRequest(url, options = {}) {
  const method = String(options?.method || 'GET').toUpperCase();
  if (method !== 'GET') return false;
  return /^\/api\/(series($|[/?])|home|public\/home|tags($|[/?])|search|reader($|[/?]))/.test(url);
}

function trimTrailingSlash(value = '') {
  return String(value || '').trim().replace(/\/$/, '');
}

function safeSnapshotPart(value = '') {
  const part = String(value || '').trim().replace(/^\/+|\/+$/g, '');
  if (!part || part === '.' || part === '..' || part.includes('/') || part.includes('\\')) return '';
  return encodeURIComponent(part);
}

export function publicSnapshotUrl(url, config = getRuntimeConfig()) {
  const value = String(url || '');
  if (!value.startsWith('/api/')) return '';
  const baseUrl = trimTrailingSlash(config.publicSnapshotBaseUrl || '/static-api');
  if (!baseUrl) return '';
  const parsed = new URL(value, 'https://cuontruyen.local');

  if (parsed.pathname === '/api/home' || parsed.pathname === '/api/public/home') {
    return `${baseUrl}/home.json`;
  }

  if (parsed.pathname === '/api/series') {
    const seriesId = parsed.searchParams.get('series') || parsed.searchParams.get('id');
    if (seriesId) {
      const part = safeSnapshotPart(seriesId);
      return part ? `${baseUrl}/series/${part}.json` : '';
    }
    if (parsed.searchParams.get('full') === '1') return '';
    return `${baseUrl}/series.json`;
  }

  if (parsed.pathname === '/api/reader') {
    return readerSnapshotUrl(baseUrl, {
      series: parsed.searchParams.get('series'),
      chapter: parsed.searchParams.get('chapter'),
      window: parsed.searchParams.get('window'),
      start: parsed.searchParams.get('start')
    });
  }

  const readerPathMatch = parsed.pathname.match(/^\/api\/series\/([^/]+)\/chapters\/([^/]+)(\/next)?$/);
  if (readerPathMatch) {
    return readerSnapshotUrl(baseUrl, {
      series: decodeURIComponent(readerPathMatch[1]),
      chapter: decodeURIComponent(readerPathMatch[2]),
      window: parsed.searchParams.get('window'),
      start: readerPathMatch[3] ? 'next' : parsed.searchParams.get('start')
    });
  }

  const seriesPathMatch = parsed.pathname.match(/^\/api\/series\/([^/]+)$/);
  if (seriesPathMatch) {
    const part = safeSnapshotPart(decodeURIComponent(seriesPathMatch[1]));
    return part ? `${baseUrl}/series/${part}.json` : '';
  }

  if (parsed.pathname === '/api/tags') {
    const tag = safeSnapshotPart(parsed.searchParams.get('tag') || parsed.searchParams.get('slug'));
    return tag ? `${baseUrl}/tags/${tag}.json` : '';
  }

  if (parsed.pathname.startsWith('/api/tags/')) {
    const tag = safeSnapshotPart(decodeURIComponent(parsed.pathname.replace('/api/tags/', '')));
    return tag ? `${baseUrl}/tags/${tag}.json` : '';
  }

  return '';
}

function readerSnapshotUrl(baseUrl, { series = '', chapter = '', window = 0, start = '' } = {}) {
  const seriesPart = safeSnapshotPart(series);
  const chapterPart = safeSnapshotPart(chapter);
  if (!seriesPart || !chapterPart) return '';

  const windowSize = Math.max(0, Number(window || 0));
  const isNext = String(start || '').trim() === 'next';
  if (isNext) {
    const filename = windowSize > 0 ? `next-window-${windowSize}.json` : 'next.json';
    return `${baseUrl}/reader/${seriesPart}/${chapterPart}/${filename}`;
  }
  if (windowSize > 0) return `${baseUrl}/reader/${seriesPart}/${chapterPart}/window-${windowSize}.json`;
  return `${baseUrl}/reader/${seriesPart}/${chapterPart}.json`;
}

export function createApiClient({
  cache = createBoundedCache({ maxEntries: 100 }),
  resolveUrl = apiUrl,
  adminTokenProvider = () => '',
  userTokenProvider = () => ''
} = {}) {
  async function fetchJson(url, options) {
    const cacheable = isCacheableRequest(url, options);
    if (cacheable && cache.has(url)) return cache.get(url);

    const request = fetchJsonWithSnapshot(url, options);

    if (cacheable) {
      cache.set(url, request);
      request.catch(() => cache.delete(url));
    }

    return request;
  }

  async function fetchJsonWithSnapshot(url, options) {
    const config = getRuntimeConfig();
    const snapshotUrl = config.preferPublicSnapshots && isCacheableRequest(url, options)
      ? publicSnapshotUrl(url, config)
      : '';
    if (snapshotUrl) {
      try {
        return await fetchJsonUrl(snapshotUrl, options);
      } catch (error) {
        if (![404, 405].includes(Number(error.status || 0))) throw error;
      }
    }
    return fetchJsonUrl(resolveUrl(url), options);
  }

  async function fetchJsonUrl(url, options) {
    return fetch(url, options).then(async (response) => {
      const data = await readJsonResponse(response);
      if (!response.ok) {
        const detail = data.detail && data.detail !== data.error ? `: ${data.detail}` : '';
        const error = new Error(`${data.error || 'Request failed'}${detail}`);
        error.status = response.status;
        error.payload = data;
        throw error;
      }
      return data;
    });
  }

  function invalidateContentCache() {
    cache.clear();
  }

  function adminHeaders(extra = {}) {
    const token = String(adminTokenProvider() || '').trim();
    return {
      'content-type': 'application/json',
      ...(token ? { 'x-admin-token': token } : {}),
      ...extra
    };
  }

  function userHeaders(extra = {}) {
    const token = String(userTokenProvider() || '').trim();
    return {
      'content-type': 'application/json',
      ...(token ? { 'x-user-token': token } : {}),
      ...extra
    };
  }

  return {
    adminHeaders,
    fetchJson,
    invalidateContentCache,
    userHeaders
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    const message = text.trim().slice(0, 200);
    if (!response.ok) {
      return {
        error: normalizePlainTextApiError(message, response.status)
      };
    }
    throw new Error(`API response is not JSON: ${message || response.status}`);
  }
}

function normalizePlainTextApiError(message = '', status = 0) {
  if (/^not found$/i.test(message)) {
    return 'Kh\u00f4ng t\u00ecm th\u1ea5y API endpoint. H\u00e3y ki\u1ec3m tra backend API \u0111ang ch\u1ea1y ho\u1eb7c Vercel Function \u0111\u00e3 deploy xong.';
  }
  return message || `Request failed (${status})`;
}
