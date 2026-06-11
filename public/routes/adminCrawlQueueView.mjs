import { escapeHtml } from '../domUtils.mjs';

export function renderCrawlQueueStatusView(summary = {}) {
  const counts = summary.counts || {};
  const runningJob = Array.isArray(summary.running) ? summary.running[0] : null;
  const queuedJobs = Array.isArray(summary.queued) ? summary.queued : [];
  const retryingJobs = Array.isArray(summary.retrying) ? summary.retrying : [];
  const failedJobs = Array.isArray(summary.failed) ? summary.failed : [];
  const totalWaiting = Number(counts.queued || 0) + Number(counts.retrying || 0);
  const worker = summary.worker || {};
  const workerText = worker.embeddedEnabled
    ? worker.active ? 'Crawler local đang xử lý queue.' : 'Crawler local sẵn sàng tự chạy khi có job chờ.'
    : 'Crawler embedded đang tắt; cần chạy worker riêng.';

  return {
    className: `status-line crawl-queue-status${failedJobs.length ? ' warning' : ''}`,
    html: `
      <div class="progress-copy">
        <strong>${runningJob ? escapeHtml(runningJob.progress?.message || 'Đang crawl...') : totalWaiting ? 'Có job đang chờ crawler nhận' : 'Queue crawl đang rảnh'}</strong>
        <span>${escapeHtml(workerText)}</span>
      </div>
      <div class="progress-grid">
        <span>Đang chạy: ${Number(counts.running || 0)}</span>
        <span>Đang chờ: ${Number(counts.queued || 0)}</span>
        <span>Retry: ${Number(counts.retrying || 0)}</span>
        <span>Lỗi: ${Number(counts.failed || 0)}</span>
      </div>
      ${summary.staleResetCount ? `<p class="muted">Đã tự mở khóa ${Number(summary.staleResetCount)} job bị kẹt.</p>` : ''}
      ${runningJob ? renderCrawlQueueRunningJob(runningJob) : ''}
      ${queuedJobs.length ? renderCrawlQueueWaitingList('Job chờ tiếp theo', queuedJobs) : ''}
      ${retryingJobs.length ? renderCrawlQueueWaitingList('Job sẽ retry', retryingJobs) : ''}
      ${failedJobs.length ? renderCrawlQueueWaitingList('Job lỗi gần nhất', failedJobs) : ''}
    `
  };
}

export function renderCrawlQueueRunningJob(job = {}) {
  const progress = job.progress || {};
  const chapterTotal = Number(progress.totalChapters || 0);
  const chapterDone = Number(progress.processedChapters || 0);
  const imageTotal = Number(progress.totalImages || 0);
  const imageDone = Number(progress.processedImages || progress.downloadedImages || 0);
  const imagePercent = imageTotal ? Math.min(100, Math.round((imageDone / imageTotal) * 100)) : 0;
  const eta = progress.etaSeconds != null ? formatCrawlDuration(progress.etaSeconds) : 'đang tính';
  return `
    <div class="crawl-queue-current">
      <div class="crawl-meter" aria-label="Tiến trình crawl">
        <span style="width:${imagePercent}%"></span>
      </div>
      <div class="progress-grid">
        <span>Chapter: ${chapterDone}/${chapterTotal || '?'}</span>
        <span>Ảnh: ${imageDone}/${imageTotal || '?'}</span>
        <span>Tốc độ: ${formatCrawlRate(progress.imagesPerMinute, 'ảnh/phút')}</span>
        <span>ETA: ${eta}</span>
      </div>
      <p class="muted">${escapeHtml(job.payload?.url || '')}</p>
    </div>
  `;
}

export function renderCrawlQueueWaitingList(title, jobs = []) {
  return `
    <div class="crawl-queue-list">
      <strong>${escapeHtml(title)}</strong>
      ${jobs.slice(0, 4).map((job) => `
        <p>
          <span>${escapeHtml(job.payload?.mode || 'full')}</span>
          <span>${escapeHtml(job.payload?.url || job.payload?.seriesId || job.id || '')}</span>
          ${job.error ? `<small>${escapeHtml(job.error)}</small>` : ''}
        </p>
      `).join('')}
    </div>
  `;
}

export function formatCrawlDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return 'đang tính';
  if (value < 60) return `${Math.max(1, Math.round(value))} giây`;
  const minutes = Math.floor(value / 60);
  const remainingSeconds = Math.round(value % 60);
  if (minutes < 60) return remainingSeconds ? `${minutes} phút ${remainingSeconds} giây` : `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} giờ ${remainingMinutes} phút` : `${hours} giờ`;
}

export function formatCrawlRate(value, suffix) {
  const rate = Number(value || 0);
  if (!rate) return `0 ${suffix}`;
  return `${rate.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} ${suffix}`;
}
