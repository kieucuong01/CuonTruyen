const DEFAULT_CONFIG = {
  apiBaseUrl: '',
  importsBaseUrl: '',
  publicSiteUrl: '',
  productionBaseUrl: '',
  enableLocalCrawlerUi: false
};

export function getRuntimeConfig(globalObject = globalThis) {
  return {
    ...DEFAULT_CONFIG,
    ...(globalObject?.COMIC_READER_CONFIG || {})
  };
}

function trimTrailingSlash(value = '') {
  return String(value || '').replace(/\/$/, '');
}

export function apiUrl(path, config = getRuntimeConfig()) {
  const value = String(path || '');
  if (!value.startsWith('/api/')) return value;
  if (value.startsWith('/api/admin') && isLocalAdminOrigin()) return value;
  const baseUrl = trimTrailingSlash(config.apiBaseUrl);
  return baseUrl ? `${baseUrl}${value}` : value;
}

export function isLocalAdminOrigin(globalObject = globalThis) {
  const hostname = String(globalObject?.location?.hostname || '').toLowerCase();
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '::1'
    || /^192\.168\./.test(hostname)
    || /^10\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
}

export function localOperationsEnabled(globalObject = globalThis) {
  const config = getRuntimeConfig(globalObject);
  return Boolean(config.enableLocalCrawlerUi) || isLocalAdminOrigin(globalObject);
}
