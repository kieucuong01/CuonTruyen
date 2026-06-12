import { escapeAttr, escapeHtml } from './domUtils.mjs';

export function coverImageUrl(series = {}) {
  return appendCoverCacheVersion(
    series.thumbnailUrl || series.coverThumbnailUrl || series.coverUrl || series.imageUrl || '',
    coverCacheVersion(series)
  );
}

export function renderCoverImageView(
  series = {},
  fallback = 'No cover',
  attributes = 'loading="lazy" decoding="async"'
) {
  const coverUrl = coverImageUrl(series);
  return coverUrl
    ? `<img ${escapeImageAttributes(attributes)} src="${escapeAttr(coverUrl)}" alt="${escapeAttr(series.title || 'Truyen')}">`
    : `<span>${escapeHtml(fallback)}</span>`;
}

export function normalizeTagValue(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

export function seriesOriginLabel(series = {}) {
  const tagValues = (series.tags || []).map((tag) => normalizeTagValue(
    typeof tag === 'string' ? tag : `${tag.slug || ''} ${tag.name || ''}`
  ));
  if (tagValues.some((tag) => tag.includes('manhwa') || tag.includes('truyen-han'))) return 'Truyện Hàn';
  if (tagValues.some((tag) => tag.includes('manga') || tag.includes('truyen-nhat'))) return 'Truyện Nhật';
  if (tagValues.some((tag) => tag.includes('manhua') || tag.includes('truyen-trung'))) return 'Truyện Trung';
  return series.sourceMappings?.[0]?.adapter || 'Truyện tranh';
}

function escapeImageAttributes(attributes = '') {
  return String(attributes).replace(/"([^"]*)"/g, (_match, value) => `"${escapeAttr(value)}"`);
}

function appendCoverCacheVersion(url = '', version = '') {
  const raw = String(url || '');
  const cacheVersion = String(version || '').trim();
  if (!raw || !cacheVersion || /^data:/i.test(raw) || /[?&]v=/.test(raw)) return raw;
  const hashIndex = raw.indexOf('#');
  const base = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
  return `${base}${base.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheVersion)}${hash}`;
}

function coverCacheVersion(series = {}) {
  const thumbnail = series.coverThumbnail || {};
  const value = [
    thumbnail.sourceType,
    thumbnail.sourceUrl,
    thumbnail.width,
    thumbnail.height,
    thumbnail.sourceBytes,
    thumbnail.storedBytes,
    thumbnail.format,
    series.updatedAt
  ].filter((item) => item !== undefined && item !== null && item !== '').join('|');
  return value ? Math.abs(hashCode(value)).toString(36) : '';
}

function hashCode(value = '') {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return hash;
}
