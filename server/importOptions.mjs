function numberOrDefault(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function normalizeImportPayload(body) {
  return {
    url: body.url,
    maxChapters: numberOrDefault(body.maxChapters, 2),
    maxPages: numberOrDefault(body.maxPages, 8)
  };
}
