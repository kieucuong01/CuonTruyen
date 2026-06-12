import { hasReadableChapter } from '../chapterState.mjs';
import { escapeAttr, escapeHtml } from '../domUtils.mjs';

export function adminSeriesStats(series = {}) {
  const chapters = Array.isArray(series.chapters) ? series.chapters : [];
  const status = series.status || 'draft';
  return {
    status,
    chapterCount: Number(series.chapterCount || chapters.length || 0),
    importedChapterCount: Number(series.importedChapterCount || series.chapterCount || chapters.length || 0),
    pageCount: Number(series.pageCount || 0),
    draftCount: chapters.filter((chapter) => (chapter.status || 'draft') === 'draft').length,
    removedCount: chapters.filter((chapter) => chapter.status === 'removed').length,
    missingImageCount: chapters.filter((chapter) => !hasReadableChapter(chapter)).length
  };
}

export function renderAdminSeriesBadges(stats = {}) {
  return `
      <div class="admin-series-badges">
        <span class="admin-series-status is-${normalizeStatusClass(stats.status)}">${escapeHtml(statusLabel(stats.status))}</span>
        ${stats.draftCount ? `<span>${Number(stats.draftCount)} draft</span>` : ''}
        ${stats.removedCount ? `<span>${Number(stats.removedCount)} đã ẩn</span>` : ''}
        ${stats.missingImageCount ? `<span>${Number(stats.missingImageCount)} thiếu ảnh</span>` : ''}
      </div>
    `;
}

export function renderAssetModeBadge(series = {}) {
  const mode = series.importMode || 'image_url';
  const status = series.assetStatus || (mode === 'full_download' ? 'local' : 'external');
  const label = status === 'mixed'
    ? 'Lẫn URL và file'
    : mode === 'full_download'
    ? 'Cào từ gốc + tải ảnh'
    : 'Chỉ URL ảnh';
  const detail = assetStatusLabel(status);
  return `
      <div class="admin-series-badges">
        <span class="admin-series-status is-${escapeAttr(assetStatusClass(status))}">${escapeHtml(label)}</span>
        <span>${escapeHtml(detail)}</span>
      </div>
    `;
}

export function seriesUsesExternalImageUrls(series = {}) {
  const mode = series.importMode || 'image_url';
  const status = series.assetStatus || (mode === 'full_download' ? 'local' : 'external');
  return mode === 'image_url' || status === 'external' || status === 'mixed';
}

export function assetStatusLabel(status = '') {
  if (status === 'local') return 'Đã có file local/S3';
  if (status === 's3') return 'Đã sync S3';
  if (status === 'cdn') return 'Đã qua CDN';
  if (status === 'mixed') return 'Lẫn URL và file';
  return 'Đọc ảnh từ nguồn';
}

export function assetStatusClass(status = '') {
  if (status === 'local' || status === 's3' || status === 'cdn') return 'public';
  if (status === 'mixed') return 'draft';
  return 'removed';
}

export function statusLabel(status) {
  if (status === 'public') return 'Public';
  if (status === 'removed') return 'Removed';
  return 'Draft';
}

export function normalizeStatusClass(status) {
  return ['public', 'draft', 'removed'].includes(status) ? status : 'draft';
}

export function sourceUrlForAdminSeries(series = {}) {
  return series.sourceUrl || series.sourceMappings?.find((mapping) => mapping.sourceUrl)?.sourceUrl || '';
}
