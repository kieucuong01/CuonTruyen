const DEFAULT_CONFIG = {
  apiBaseUrl: '',
  staticApiMode: false,
  staticApiBaseUrl: ''
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
  const baseUrl = trimTrailingSlash(config.apiBaseUrl);
  return baseUrl ? `${baseUrl}${value}` : value;
}
