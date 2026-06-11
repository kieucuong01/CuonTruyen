import { escapeAttr, escapeHtml } from '../domUtils.mjs';

export function productionStatusForSeries(series = {}, productionStatus = null) {
  return productionStatus?.statuses?.[series.id] || null;
}

export function renderProductionPipelineStep(series, step, productionUrl) {
  const action = step.check
    ? `data-production-check="${escapeAttr(series.id)}" data-production-url="${escapeAttr(productionUrl)}"`
    : step.buttonAttr || `data-production-step="${escapeAttr(series.id)}" data-steps="${escapeAttr((step.steps || []).join(','))}"`;
  return `
      <article class="production-pipeline-step is-${escapeAttr(step.key)}">
        <div>
          <strong>${escapeHtml(step.label)}</strong>
          <p>${escapeHtml(step.description)}</p>
        </div>
        <button class="ghost-btn" type="button" ${action} ${step.disabled ? 'disabled' : ''}>${escapeHtml(step.button)}</button>
      </article>
    `;
}

export function renderProductionProgressView(job = {}) {
  const steps = Array.isArray(job.steps) ? job.steps : [];
  const done = steps.filter((step) => step.status === 'completed').length;
  const percent = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const activeStep = steps.find((step) => step.status === 'running') || steps.find((step) => step.status === 'failed') || steps[steps.length - 1] || {};
  const logs = Array.isArray(job.logs) ? job.logs.slice(-6) : [];
  return {
    className: `status-line production-progress${job.status === 'failed' ? ' error' : ''}`,
    html: `
      <div class="progress-copy">
        <strong>${escapeHtml(productionJobMessage(job, activeStep))}</strong>
        ${job.error ? `<small>${escapeHtml(job.error)}</small>` : ''}
        <span>${done}/${steps.length || '?'} bước - ${escapeHtml(job.status || 'running')}</span>
      </div>
      <div class="crawl-meter" aria-label="Tiến độ production workflow">
        <div style="width:${Math.max(4, Math.min(100, percent))}%"></div>
      </div>
      <div class="production-step-list">
        ${steps.map((step, index) => `
          <article class="production-step is-${escapeAttr(step.status || 'pending')}">
            <b>${productionStepIcon(step.status)} ${index + 1}. ${escapeHtml(step.label || step.key || 'Bước')}</b>
            <span>${escapeHtml(step.description || '')}</span>
            ${renderProductionStepProgress(step)}
            ${step.error ? `<small>${escapeHtml(step.error)}</small>` : step.output && step.status === 'completed' ? `<small>${escapeHtml(step.output.split('\n').slice(-2).join(' · '))}</small>` : ''}
          </article>
        `).join('')}
      </div>
      ${logs.length ? `<div class="production-log">${logs.map((log) => `<span>${escapeHtml(log.text || '')}</span>`).join('')}</div>` : ''}
    `
  };
}

export function renderProductionStepProgress(step = {}) {
  const progress = step.progress || {};
  const total = Number(progress.total || 0);
  if (!total) return '';
  const checked = Number(progress.checked || 0);
  const percent = Math.round((checked / total) * 100);
  return `
    <div class="production-step-progress">
      <div class="crawl-meter" aria-label="Tiến độ ${escapeAttr(step.label || step.key || 'sync')}">
        <div style="width:${Math.max(4, Math.min(100, percent))}%"></div>
      </div>
      <div class="production-step-metrics">
        <span>Đã kiểm tra: ${checked}/${total}</span>
        <span>Upload: ${Number(progress.uploaded || 0)}</span>
        <span>Skip: ${Number(progress.skipped || 0)}</span>
        <span>Skip cache local: ${Number(progress.cached || progress.cachedSkipped || 0)}</span>
        <span>Lỗi: ${Number(progress.failed || 0)}</span>
        <span>Tốc độ: ${Number(progress.ratePerMinute || 0).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} file/phút</span>
        <span>ETA: ${escapeHtml(progress.eta || 'đang tính')}</span>
        <span>Luồng: ${Number(progress.concurrency || 0) || '?'}</span>
      </div>
    </div>
  `;
}

export function productionJobMessage(job = {}, activeStep = {}) {
  if (job.status === 'completed') return job.result?.message || 'Đã sync production xong.';
  if (job.status === 'failed') return job.error || activeStep.error || 'Workflow production bị lỗi.';
  if (activeStep.label) return `Đang chạy: ${activeStep.label}`;
  return 'Đang chuẩn bị workflow production...';
}

export function productionStepIcon(status) {
  if (status === 'completed') return '✓';
  if (status === 'running') return '…';
  if (status === 'failed') return '!';
  return '○';
}

export function renderAdminProductionBadge(series = {}, productionStatus = null) {
  const status = productionStatusForSeries(series, productionStatus);
  const state = status?.state || 'unchecked';
  const images = status?.images || {};
  const sync = status?.sync || null;
  const title = status
    ? [
      `Ảnh S3: ${Number(images.uploaded || 0)}/${Number(images.total || 0)}`,
      sync ? `Đang sync: ${Number(sync.percent || 0)}% - ETA ${sync.eta || 'đang tính'}` : ''
    ].filter(Boolean).join(' · ')
    : 'Chưa có dữ liệu sync local để kết luận.';
  return `
      <div class="admin-production-badge-row">
        <span class="admin-production-badge is-${escapeAttr(productionStatusClass(state))}" title="${escapeAttr(title)}">
          ${productionStatusIcon(state)} ${escapeHtml(status?.label || 'Chưa kiểm tra')}
        </span>
        ${renderAdminProductionMiniStats(status)}
      </div>
    `;
}

function renderAdminProductionMiniStats(status) {
  if (!status) return '<small>Chưa có dữ liệu S3 sync state.</small>';
  if (status.state === 'syncing') {
    return `<small>${Number(status.sync?.percent || 0)}% · ETA ${escapeHtml(status.sync?.eta || 'đang tính')}</small>`;
  }
  if (status.state === 'missing-images') {
    return `<small>Thiếu ${Number(status.images?.missing || 0).toLocaleString('vi-VN')} ảnh</small>`;
  }
  if (status.state === 'ok') {
    return '<small>Ảnh S3 đã có trong state</small>';
  }
  return `<small>${escapeHtml(status.label || 'Chưa kiểm tra')}</small>`;
}

export function productionStatusClass(state = '') {
  if (state === 'ok') return 'ok';
  if (state === 'syncing') return 'syncing';
  if (state === 'missing-images') return 'warning';
  if (state === 'not-public') return 'draft';
  return 'unchecked';
}

export function productionStatusIcon(state = '') {
  if (state === 'ok') return '&#10003;';
  if (state === 'syncing') return '...';
  if (state === 'missing-images') return '!';
  return '&#9675;';
}
