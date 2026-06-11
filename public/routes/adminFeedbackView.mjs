import { escapeAttr, escapeHtml } from '../domUtils.mjs';

export function renderAdminLoginView({
  topbarHtml = '',
  email = '',
  message = ''
} = {}) {
  return `
      <main class="site-shell admin-shell">
        ${topbarHtml}
        <section class="admin-login-card">
          <form class="import-panel admin-login-panel" data-admin-login-form>
            <h2>Đăng nhập admin</h2>
            <input name="email" type="email" required placeholder="Email admin" value="${escapeAttr(email)}" autocomplete="username" />
            <input name="password" type="password" required placeholder="Mật khẩu" autocomplete="current-password" />
            <button class="primary-btn" type="submit">Đăng nhập</button>
          </form>
          <p class="status-line ${message ? 'error' : ''}" data-status>${escapeHtml(message)}</p>
        </section>
      </main>
    `;
}

export function renderProductionCheckResult(result = {}, url = '') {
  const checks = Array.isArray(result.checks) ? result.checks : [];
  return `
      <div class="progress-copy">
        <strong>Production OK (${Number(result.status || 200)})</strong>
        <a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>
      </div>
      ${checks.length ? `<div class="production-step-list">
        ${checks.map((check) => `
          <article class="production-step is-${check.ok ? 'completed' : 'failed'}">
            <b>${check.ok ? '✓' : '!'} ${escapeHtml(check.label || check.key || 'Check')}</b>
            <span>${escapeHtml(check.url || '')}</span>
            <small>${check.ok ? `HTTP ${Number(check.status || 200)}` : escapeHtml(check.error || `HTTP ${Number(check.status || 0)}`)}</small>
          </article>
        `).join('')}
      </div>` : ''}
    `;
}

export function renderAdminApiError(error, fallback = 'Request failed.') {
  const payload = error?.payload || {};
  const storage = payload.storage || {};
  const postgres = storage.postgres || {};
  const hints = Array.isArray(payload.hints) ? payload.hints : [];
  const storageLabel = storage.mode === 'postgres'
    ? `Postgres${postgres.host ? ` - ${postgres.host}${postgres.database ? `/${postgres.database}` : ''}` : ''}`
    : storage.mode ? storage.mode : '';

  return `
      <div class="progress-copy">
        <strong>${escapeHtml(payload.error || fallback)}</strong>
        ${error?.message && error.message !== payload.error ? `<span>${escapeHtml(error.message)}</span>` : ''}
        ${payload.cause ? `<small>${escapeHtml(payload.cause)}</small>` : ''}
        ${storageLabel ? `<small>Catalog storage: ${escapeHtml(storageLabel)}</small>` : ''}
        ${hints.length ? `<small>${hints.map((hint) => escapeHtml(hint)).join(' | ')}</small>` : ''}
      </div>
    `;
}
