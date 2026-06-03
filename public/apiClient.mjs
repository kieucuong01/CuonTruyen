import { createBoundedCache } from './cacheStore.mjs';
import { apiUrl, getRuntimeConfig } from './runtimeConfig.mjs';

export { apiUrl };

export function isCacheableRequest(url, options = {}) {
  const method = String(options?.method || 'GET').toUpperCase();
  if (method !== 'GET') return false;
  return /^\/api\/(series($|\/)|home|public\/home|tags\/|search)/.test(url);
}

export function createApiClient({
  cache = createBoundedCache({ maxEntries: 100 }),
  resolveUrl = apiUrl,
  adminTokenProvider = () => ''
} = {}) {
  async function fetchJson(url, options) {
    const staticRequest = staticApiRequest(url, options);
    if (staticRequest) return staticRequest;

    const cacheable = isCacheableRequest(url, options);
    if (cacheable && cache.has(url)) return cache.get(url);

    const request = fetch(resolveUrl(url), options).then(async (response) => {
      const data = await response.json();
      if (!response.ok) {
        const detail = data.detail && data.detail !== data.error ? `: ${data.detail}` : '';
        throw new Error(`${data.error || 'Request failed'}${detail}`);
      }
      return data;
    });

    if (cacheable) {
      cache.set(url, request);
      request.catch(() => cache.delete(url));
    }

    return request;
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

  return {
    adminHeaders,
    fetchJson,
    invalidateContentCache
  };
}

function staticApiRequest(url, options = {}) {
  const config = getRuntimeConfig();
  const method = String(options?.method || 'GET').toUpperCase();
  const parsed = parseApiUrl(url);
  const useStaticApi = Boolean(config.staticApiMode || config.staticApiBaseUrl);
  if (!useStaticApi || !parsed) return null;

  if (method === 'POST' && parsed.pathname === '/api/events' && !config.apiBaseUrl) {
    return Promise.resolve({ ok: true, static: true });
  }

  if (parsed.pathname.startsWith('/api/admin') && !config.apiBaseUrl) {
    return Promise.reject(new Error('Admin cần API_BASE_URL trỏ tới backend local/VPS. Public Vercel static chỉ dùng để đọc truyện.'));
  }

  if (method !== 'GET') return null;

  const searchQuery = parsed.pathname === '/api/search'
    ? parsed.searchParams.get('q') || ''
    : null;
  if (searchQuery !== null) {
    return fetchStaticJson('search-index.json', config)
      .then((data) => ({ series: filterStaticSearch(data.series || [], searchQuery) }));
  }

  const staticPath = staticApiPath(parsed.pathname);
  return staticPath ? fetchStaticJson(staticPath, config) : null;
}

function parseApiUrl(url) {
  try {
    return new URL(String(url || ''), 'https://comic-reader.local');
  } catch {
    return null;
  }
}

function staticApiPath(pathname) {
  if (pathname === '/api/home' || pathname === '/api/public/home') return 'home.json';
  if (pathname === '/api/series') return 'series.json';

  const tagMatch = pathname.match(/^\/api\/tags\/([^/]+)$/);
  if (tagMatch) return `tags/${safeSegment(tagMatch[1])}.json`;

  const nextMatch = pathname.match(/^\/api\/series\/([^/]+)\/chapters\/([^/]+)\/next$/);
  if (nextMatch) return `reader/${safeSegment(nextMatch[1])}/${safeSegment(nextMatch[2])}/next.json`;

  const chapterMatch = pathname.match(/^\/api\/series\/([^/]+)\/chapters\/([^/]+)$/);
  if (chapterMatch) return `reader/${safeSegment(chapterMatch[1])}/${safeSegment(chapterMatch[2])}.json`;

  const seriesMatch = pathname.match(/^\/api\/series\/([^/]+)$/);
  if (seriesMatch) return `series/${safeSegment(seriesMatch[1])}.json`;

  return '';
}

function fetchStaticJson(path, config) {
  const baseUrl = trimTrailingSlash(config.staticApiBaseUrl || '/static-api');
  const url = `${baseUrl}/${path.replace(/^\/+/, '')}`;
  return fetch(url).then(async (response) => {
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text.slice(0, 200) || 'Static API response is not JSON' };
    }
    if (!response.ok) throw new Error(data.error || `Static API not found: ${path}`);
    return data;
  });
}

function safeSegment(value) {
  return encodeURIComponent(decodeURIComponent(String(value || '')));
}

function trimTrailingSlash(value = '') {
  return String(value || '').replace(/\/$/, '');
}

function normalizeSearchText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function filterStaticSearch(seriesList, query) {
  const needle = normalizeSearchText(query);
  if (!needle) return [];
  return seriesList.filter((series) => {
    const haystack = normalizeSearchText([
      series.title,
      series.slug,
      ...(series.aliases || []),
      ...(series.tags || []).map((tag) => tag.name)
    ].join(' '));
    return haystack.includes(needle);
  });
}
