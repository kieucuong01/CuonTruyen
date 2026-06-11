function numberOrDefault(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const ASSET_MODE_IMAGE_URL = 'image_url';
export const ASSET_MODE_FULL_DOWNLOAD = 'full_download';

export function normalizeAssetMode(value) {
  return value === ASSET_MODE_FULL_DOWNLOAD ? ASSET_MODE_FULL_DOWNLOAD : ASSET_MODE_IMAGE_URL;
}

export function parseImportUrls(input) {
  const text = Array.isArray(input) ? input.join('\n') : String(input || '');
  const values = text.match(/https?:\/\/[^\s,]+/gi) || [];
  return [
    ...new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  ];
}

export function normalizeImportPayload(body) {
  return {
    url: String(body.url || '').trim(),
    maxChapters: numberOrDefault(body.maxChapters, 2),
    maxPages: numberOrDefault(body.maxPages, 8),
    assetMode: normalizeAssetMode(body.assetMode)
  };
}

export function normalizeImportBatchPayload(body) {
  const urls = parseImportUrls(body.urls || body.url);
  return urls.map((url) => normalizeImportPayload({ ...body, url }));
}
