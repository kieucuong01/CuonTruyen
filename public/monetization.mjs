function readBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return !['0', 'false', 'off', 'no'].includes(String(value).trim().toLowerCase());
}

export function normalizeMonetizationConfig(config = {}) {
  const source = config && typeof config === 'object' ? config : {};
  return {
    adsEnabled: readBoolean(source.adsEnabled, true),
    donateUrl: typeof source.donateUrl === 'string' ? source.donateUrl : '',
    adminNoAds: readBoolean(source.adminNoAds, true)
  };
}

export function shouldShowAds(options = {}) {
  const config = normalizeMonetizationConfig(options.config || {});
  if (!config.adsEnabled) return false;
  const route = String(options.route || '');
  if (config.adminNoAds && (route.startsWith('#/admin') || route.includes('/admin'))) return false;
  return true;
}
