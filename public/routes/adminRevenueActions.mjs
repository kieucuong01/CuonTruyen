import { escapeHtml as defaultEscapeHtml } from '../domUtils.mjs';
import { renderRevenueDashboard as defaultRenderRevenueDashboard } from './adminRevenueView.mjs';

export function createAdminRevenueActions({
  app,
  escapeHtml = defaultEscapeHtml,
  loadAdminAnalytics,
  renderRevenueDashboard = defaultRenderRevenueDashboard
} = {}) {
  function bindRevenueDashboard() {
    const dashboard = app.querySelector('[data-revenue-dashboard]');
    if (!dashboard) return;
    dashboard.querySelectorAll('[data-analytics-range]').forEach((button) => {
      button.addEventListener('click', (event) => handleRevenueRangeClick(event, dashboard));
    });
  }

  async function handleRevenueRangeClick(event, dashboard = app.querySelector('[data-revenue-dashboard]')) {
    if (!dashboard) return;
    const button = event.currentTarget;
    const range = button.dataset.analyticsRange || '30d';
    button.disabled = true;
    try {
      const summary = await loadAdminAnalytics(range);
      dashboard.outerHTML = renderRevenueDashboard(summary);
      bindRevenueDashboard();
    } catch (error) {
      dashboard.insertAdjacentHTML('afterbegin', `<div class="status-line error">Không tải được analytics: ${escapeHtml(error.message)}</div>`);
    } finally {
      button.disabled = false;
    }
  }

  return {
    bindRevenueDashboard,
    handleRevenueRangeClick
  };
}
