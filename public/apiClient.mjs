import { createBoundedCache } from './cacheStore.mjs';
import { apiUrl } from './runtimeConfig.mjs';

export { apiUrl };

export function isCacheableRequest(url, options = {}) {
  const method = String(options?.method || 'GET').toUpperCase();
  if (method !== 'GET') return false;
  return /^\/api\/(series($|[/?])|home|public\/home|tags($|[/?])|search)/.test(url);
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

    const request = fetch(resolveUrl(url), options).then(async (response) => {
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
