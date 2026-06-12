import { escapeAttr, escapeHtml } from './domUtils.mjs';

export function coverImageUrl(series = {}) {
  return series.thumbnailUrl || series.coverThumbnailUrl || series.coverUrl || series.imageUrl || '';
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
