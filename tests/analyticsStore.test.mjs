import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAnalyticsSummary, normalizeAnalyticsEvent } from '../server/analyticsStore.mjs';
import { recordEventOnCatalog } from '../server/contentStore.mjs';

test('normalizeAnalyticsEvent preserves placement for donate and ad reporting', () => {
  const event = normalizeAnalyticsEvent({
    type: 'donate_click',
    seriesSlug: 'demo-series',
    chapterId: 'chapter-1',
    placement: 'reader',
    url: 'http://localhost/read',
    at: '2026-05-28T00:00:00.000Z'
  });
  assert.equal(event.type, 'donate_click');
  assert.equal(event.placement, 'reader');
  assert.equal(event.chapterSlug, 'chapter-1');
});

test('recordEventOnCatalog tracks donate clicks separately from ad impressions', () => {
  const catalog = {
    series: [{ id: 's1', title: 'Demo', slug: 'demo', status: 'public', chapters: [], stats: {} }]
  };
  const donated = recordEventOnCatalog(catalog, { type: 'donate_click', seriesSlug: 'demo' });
  const ad = recordEventOnCatalog(donated.catalog, { type: 'ad_impression', seriesSlug: 'demo' });
  assert.equal(ad.series.stats.donateClicks, 1);
  assert.equal(ad.series.stats.adViews, 1);
});

test('buildAnalyticsSummary ranks series and computes internal ad CTR by range', () => {
  const catalog = {
    series: [
      { id: 's1', title: 'Demo', slug: 'demo', stats: { views: 100, adViews: 50, donateClicks: 2 } },
      { id: 's2', title: 'Quiet', slug: 'quiet', stats: { views: 1 } }
    ]
  };
  const events = [
    { type: 'pageview', seriesSlug: 'demo', at: '2026-06-05T00:00:00.000Z' },
    { type: 'ad_impression', seriesSlug: 'demo', placement: 'reader', at: '2026-06-05T00:00:00.000Z' },
    { type: 'ad_click', seriesSlug: 'demo', placement: 'reader', at: '2026-06-05T00:00:01.000Z' },
    { type: 'donate_click', seriesSlug: 'demo', placement: 'home', at: '2026-06-05T00:00:02.000Z' },
    { type: 'pageview', seriesSlug: 'quiet', at: '2026-04-01T00:00:00.000Z' }
  ];

  const summary = buildAnalyticsSummary({
    catalog,
    events,
    range: '7d',
    now: new Date('2026-06-06T00:00:00.000Z')
  });

  assert.equal(summary.totals.views, 1);
  assert.equal(summary.totals.adImpressions, 1);
  assert.equal(summary.totals.adClicks, 1);
  assert.equal(summary.totals.adCtr, 1);
  assert.equal(summary.totals.donateClicks, 1);
  assert.equal(summary.topSeries[0].seriesSlug, 'demo');
  assert.equal(summary.placements.reader.adImpressions, 1);
  assert.equal(summary.placements.home.donateClicks, 1);

  const all = buildAnalyticsSummary({ catalog, events: [], range: 'all' });
  assert.equal(all.totals.views, 101);
  assert.equal(all.totals.adImpressions, 50);
  assert.equal(all.totals.donateClicks, 2);
});
