import { createBoundedCache } from './cacheStore.mjs';
import { apiUrl } from './runtimeConfig.mjs';

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
    const cacheable = isCacheableRequest(url, options);
    if (cacheable && cache.has(url)) return cache.get(url);

    const request = fetch(resolveUrl(url), options).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Request failed');
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
