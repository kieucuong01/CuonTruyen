import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAnalyticsEvent } from '../server/analyticsStore.mjs';
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
