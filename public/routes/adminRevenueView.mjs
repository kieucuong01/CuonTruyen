import { escapeHtml } from '../domUtils.mjs';

export function formatNumber(value = 0) {
  return Number(value || 0).toLocaleString('vi-VN');
}

export function formatPercent(value = 0) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

export function renderRevenueDashboard(summary) {
  if (!summary) {
    return `
      <section class="admin-panel revenue-dashboard">
        <div class="admin-list-head">
          <div>
            <h2 class="section-title">Doanh thu &amp; tương tác</h2>
            <p class="muted">Chưa đọc được analytics. Dashboard sẽ tự hiện khi API sẵn sàng.</p>
          </div>
        </div>
      </section>
    `;
  }
  const totals = summary.totals || {};
  const rows = summary.topSeries || [];
  return `
    <section class="admin-panel revenue-dashboard" data-revenue-dashboard>
      <div class="admin-list-head">
        <div>
          <h2 class="section-title">Doanh thu &amp; tương tác</h2>
          <p class="muted">Theo dõi view, impression quảng cáo, CTR nội bộ và donate click theo truyện.</p>
        </div>
        <div class="revenue-range-tabs" role="group" aria-label="Khoảng thời gian analytics">
          ${['7d', '30d', 'all'].map((range) => `
            <button class="ghost-btn ${summary.range === range ? 'active' : ''}" type="button" data-analytics-range="${range}">
              ${range === 'all' ? 'Tất cả' : range.replace('d', ' ngày')}
            </button>
          `).join('')}
        </div>
      </div>
      <div class="revenue-metrics">
        <article><span>Views</span><strong>${formatNumber(totals.views)}</strong></article>
        <article><span>Ad impressions</span><strong>${formatNumber(totals.adImpressions)}</strong></article>
        <article><span>CTR quảng cáo</span><strong>${formatPercent(totals.adCtr)}</strong></article>
        <article><span>Donate clicks</span><strong>${formatNumber(totals.donateClicks)}</strong></article>
      </div>
      <div class="revenue-table-wrap">
        <table class="revenue-table">
          <thead>
            <tr>
              <th>Truyện</th>
              <th>Views</th>
              <th>Ad impressions</th>
              <th>CTR</th>
              <th>Donate</th>
              <th>Read depth</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map((row) => `
              <tr>
                <td><a data-link href="/admin/series/${encodeURIComponent(row.seriesId || row.seriesSlug)}">${escapeHtml(row.title)}</a></td>
                <td>${formatNumber(row.views)}</td>
                <td>${formatNumber(row.adImpressions)}</td>
                <td>${formatPercent(row.adCtr)}</td>
                <td>${formatNumber(row.donateClicks)}</td>
                <td>${formatNumber(row.readDepth)}%</td>
              </tr>
            `).join('') : '<tr><td colspan="6">Chưa có dữ liệu tracking trong khoảng này.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;
}
