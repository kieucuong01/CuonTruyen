import { escapeHtml } from '../domUtils.mjs';

export function renderS3SyncStatusView(status = {}, { now = Date.now() } = {}) {
  const total = Number(status.total || 0);
  const checked = Number(status.checked || 0);
  const percent = total ? Math.max(0, Math.min(100, Number(status.percent || ((checked / total) * 100)))) : 0;
  const updatedAtMs = Date.parse(status.updatedAt || '');
  const statusAgeSeconds = Number.isFinite(updatedAtMs) ? Math.max(0, Math.round((now - updatedAtMs) / 1000)) : null;
  const staleRunning = status.status === 'running' && statusAgeSeconds != null && statusAgeSeconds > 90;
  const statusClass = status.status === 'failed'
    ? ' error'
    : status.status === 'completed'
      ? ' success'
      : staleRunning
        ? ' warning'
        : '';
  const title = status.message || (status.status === 'running' ? 'Đang đồng bộ ảnh lên S3...' : status.exists ? 'Tiến trình S3 gần nhất' : 'Chưa có tiến trình S3');
  const failedItems = Array.isArray(status.failedItems) ? status.failedItems : [];

  return {
    className: `status-line s3-sync-status${statusClass}`,
    html: `
      <div class="progress-copy">
        <strong>${escapeHtml(title)}</strong>
        <span>${total ? `${percent.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% - ${checked.toLocaleString('vi-VN')}/${total.toLocaleString('vi-VN')} file` : 'Chưa có job sync đang ghi trạng thái.'}</span>
      </div>
      ${staleRunning ? '<p class="muted">Status S3 sync da hon 90 giay chua cap nhat. Job co the dang ket request S3; nen dung/retry thay vi doi vo han.</p>' : ''}
      <div class="crawl-meter" aria-label="Tiến độ đồng bộ S3">
        <div style="width:${Math.max(total ? 4 : 0, Math.min(100, percent))}%"></div>
      </div>
      <div class="progress-grid">
        <span>Trạng thái: ${escapeHtml(status.status || 'idle')}</span>
        <span>Series: ${escapeHtml(status.seriesId || 'tất cả')}</span>
        <span>Chapter hiện tại: ${escapeHtml(status.currentChapter || 'đang tính')}</span>
        <span>Upload: ${Number(status.uploaded || 0).toLocaleString('vi-VN')}</span>
        <span>Skip S3: ${Number(status.skipped || 0).toLocaleString('vi-VN')}</span>
        <span>Skip cache local: ${Number(status.cachedSkipped || 0).toLocaleString('vi-VN')}</span>
        <span>Lỗi: ${Number(status.failed || 0).toLocaleString('vi-VN')}</span>
        <span>Tốc độ: ${Number(status.ratePerMinute || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} file/phút</span>
        <span>ETA: ${escapeHtml(status.eta || 'đang tính')}</span>
        <span>Luồng: ${Number(status.concurrency || 0) || '?'}</span>
      </div>
      ${status.currentKey ? `<div class="production-log"><span>${escapeHtml(status.currentKey)}</span></div>` : ''}
      ${failedItems.length ? renderS3FailedItems(failedItems) : ''}
      ${failedItems.length ? '<button class="ghost-btn" type="button" data-s3-retry-failed>Retry file thiếu</button>' : ''}
    `
  };
}

export function renderS3FailedItems(failedItems = []) {
  return `
    <div class="progress-errors">
      <strong>File S3 lỗi gần nhất</strong>
      ${failedItems.slice(-8).map((item) => {
        const error = String(item.error || '');
        const clockHint = /RequestTimeTooSkewed|request time|clock skew/i.test(error)
          ? ' - Gợi ý: bật đồng bộ giờ Windows rồi bấm retry.'
          : '';
        return `<span>${escapeHtml(item.key || '')}: ${escapeHtml(error)}${escapeHtml(clockHint)}</span>`;
      }).join('')}
    </div>
  `;
}
