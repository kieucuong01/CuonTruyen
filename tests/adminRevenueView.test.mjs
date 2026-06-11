import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatNumber,
  formatPercent,
  renderRevenueDashboard
} from '../public/routes/adminRevenueView.mjs';

test('revenue format helpers use Vietnamese number and percent labels', () => {
  assert.equal(formatNumber(1234567), '1.234.567');
  assert.equal(formatNumber(null), '0');
  assert.equal(formatPercent(0.12345), '12.35%');
  assert.equal(formatPercent(null), '0.00%');
});

test('revenue dashboard renders unavailable analytics state without range controls', () => {
  const html = renderRevenueDashboard(null);

  assert.match(html, /Doanh thu &amp; tương tác/);
  assert.match(html, /Chưa đọc được analytics/);
  assert.doesNotMatch(html, /data-revenue-dashboard/);
  assert.doesNotMatch(html, /data-analytics-range/);
});

test('revenue dashboard renders totals, active range, and escaped series rows', () => {
  const html = renderRevenueDashboard({
    range: '7d',
    totals: {
      views: 1200,
      adImpressions: 300,
      adCtr: 0.125,
      donateClicks: 9
    },
    topSeries: [
      {
        seriesId: 'series <1>',
        seriesSlug: 'fallback',
        title: 'Title <bad>',
        views: 1000,
        adImpressions: 250,
        adCtr: 0.5,
        donateClicks: 7,
        readDepth: 88
      },
      {
        seriesSlug: 'slug-2',
        title: 'Slug Only',
        views: 200,
        adImpressions: 50,
        adCtr: 0.25,
        donateClicks: 2,
        readDepth: 42
      }
    ]
  });

  assert.match(html, /data-revenue-dashboard/);
  assert.match(html, /data-analytics-range="7d"[\s\S]*>[\s\S]*7 ngày/);
  assert.match(html, /ghost-btn active/);
  assert.match(html, /1\.200/);
  assert.match(html, /12.50%/);
  assert.match(html, /Title &lt;bad&gt;/);
  assert.match(html, /href="\/admin\/series\/series%20%3C1%3E"/);
  assert.match(html, /href="\/admin\/series\/slug-2"/);
  assert.match(html, /88%/);
  assert.doesNotMatch(html, /Title <bad>/);
});

test('revenue dashboard renders an empty tracking row when no top series exist', () => {
  const html = renderRevenueDashboard({ range: 'all', totals: {}, topSeries: [] });

  assert.match(html, /Tất cả/);
  assert.match(html, /Chưa có dữ liệu tracking trong khoảng này/);
});
