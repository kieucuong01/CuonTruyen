import { escapeHtml } from '../domUtils.mjs';
import { formatCrawlDuration, formatCrawlRate } from './adminCrawlQueueView.mjs';

export function renderImportProgressView(job = {}, { isAdminUpdateStatus = false } = {}) {
  const progress = job.progress || {};
  const chapterTotal = Number(progress.totalChapters || 0);
  const chapterDone = Number(progress.processedChapters || 0);
  const imageTotal = Number(progress.totalImages || 0);
  const imageDone = Number(progress.processedImages || progress.downloadedImages || 0);
  const downloadedImages = Number(progress.downloadedImages || 0);
  const skippedExistingImages = Number(progress.skippedExistingImages || 0);
  const usableImages = Number(progress.usableImages ?? (downloadedImages + skippedExistingImages));
  const failedImages = Number(progress.failedImages || 0);
  const seriesTotal = Number(progress.totalSeries || 1);
  const seriesDone = Number(progress.processedSeries || 0);
  const errors = Array.isArray(progress.errors) ? progress.errors : [];
  const chapterPercent = chapterTotal ? chapterDone / chapterTotal : 0;
  const imagePercent = imageTotal ? imageDone / imageTotal : 0;
  const seriesPercent = seriesTotal ? seriesDone / seriesTotal : 0;
  const percent = Math.round((seriesPercent * 0.15 + chapterPercent * 0.35 + imagePercent * 0.5) * 100);

  return {
    className: `status-line import-progress${job.status === 'failed' ? ' error' : ''}${isAdminUpdateStatus ? ' admin-wide admin-update-status' : ''}`,
    html: `
      <div class="progress-copy">
        <strong>${escapeHtml(progress.message || 'Đang import...')}</strong>
        <span>${escapeHtml(progress.currentChapterLabel || progress.currentSeriesUrl || progress.phase || '')}</span>
      </div>
      <div class="crawl-meter" aria-label="Tiến độ crawl">
        <div style="width:${Math.max(4, Math.min(100, percent))}%"></div>
      </div>
      <div class="progress-grid">
        <span>Truyện: ${seriesDone}/${seriesTotal}</span>
        <span>Phase: ${escapeHtml(progress.phase || job.status)}</span>
        <span>Chapter: ${chapterDone}/${chapterTotal || '?'}</span>
        <span>Ảnh xử lý: ${imageDone}/${imageTotal || '?'}</span>
        <span>Ảnh dùng được: ${usableImages}</span>
        <span>Tải mới: ${downloadedImages}</span>
        <span>Skip có sẵn: ${skippedExistingImages}</span>
        <span>Ảnh lỗi skip: ${failedImages}</span>
        <span>Tốc độ ảnh: ${formatCrawlRate(progress.imagesPerMinute, 'ảnh/phút')}</span>
        <span>Tốc độ chapter: ${formatCrawlRate(progress.chaptersPerMinute, 'chapter/phút')}</span>
        <span>ETA: ${formatCrawlDuration(progress.etaSeconds)}</span>
        <span>Concurrency: ${Number(progress.imageConcurrency || 1)}</span>
        <span>Trạng thái: ${escapeHtml(job.status)}</span>
        <span>Lỗi: ${Number(progress.errorCount || errors.length || 0)}</span>
      </div>
      ${errors.length ? `<div class="progress-errors">${errors.slice(-3).map((error) => `<span>${escapeHtml(error)}</span>`).join('')}</div>` : ''}
    `
  };
}
