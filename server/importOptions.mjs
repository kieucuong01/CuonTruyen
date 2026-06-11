function numberOrDefault(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const ASSET_MODE_IMAGE_URL = 'image_url';
export const ASSET_MODE_FULL_DOWNLOAD = 'full_download';
export const IMPORT_MODE_FULL = 'full';
export const IMPORT_MODE_NEW_CHAPTERS = 'new-chapters';
export const IMPORT_MODE_REFRESH_IMAGE_URLS = 'refresh-image-urls';

export function normalizeAssetMode(value) {
  return value === ASSET_MODE_FULL_DOWNLOAD ? ASSET_MODE_FULL_DOWNLOAD : ASSET_MODE_IMAGE_URL;
}

export function normalizeImportMode(value) {
  return value === IMPORT_MODE_NEW_CHAPTERS || value === IMPORT_MODE_REFRESH_IMAGE_URLS
    ? value
    : IMPORT_MODE_FULL;
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
  const mode = normalizeImportMode(body.mode);
  return {
    url: String(body.url || '').trim(),
    maxChapters: numberOrDefault(body.maxChapters, 2),
    maxPages: numberOrDefault(body.maxPages, 8),
    assetMode: mode === IMPORT_MODE_REFRESH_IMAGE_URLS ? ASSET_MODE_IMAGE_URL : normalizeAssetMode(body.assetMode),
    mode
  };
}

export function normalizeImportBatchPayload(body) {
  const urls = parseImportUrls(body.urls || body.url);
  return urls.map((url) => normalizeImportPayload({ ...body, url }));
}
