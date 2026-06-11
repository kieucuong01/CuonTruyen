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
