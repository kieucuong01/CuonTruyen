export function sendAnalyticsEvent({ apiUrl, type, payload = {}, href = '' } = {}) {
  if (!type || typeof apiUrl !== 'function') return Promise.resolve(false);
  const body = {
    type,
    url: href || globalThis.location?.href || '',
    at: new Date().toISOString(),
    ...payload
  };
  return fetch(apiUrl('/api/events'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
    .then(() => true)
    .catch(() => false);
}
