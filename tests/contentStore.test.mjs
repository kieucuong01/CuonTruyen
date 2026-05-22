import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHomeCollections,
  buildTagIndex,
  findChapterBySlug,
  findSeriesBySlug,
  normalizeSeries,
  recordEventOnCatalog,
  updateSeriesInCatalog
} from '../server/contentStore.mjs';

const catalog = {
  series: [
    {
      id: 'manh-nhat-1',
      title: 'Mạnh Nhất Lịch Sử',
      slug: 'manh-nhat-lich-su',
      aliases: ['Strongest Ever'],
      status: 'public',
      tags: ['Manhua', 'Action'],
      updatedAt: '2026-05-22T08:00:00.000Z',
      stats: { views: 10, follows: 2 },
      chapters: [
        {
          id: 'chapter-1',
          label: 'Chapter 1',
          imported: true,
          pageCount: 2,
          pages: [
            { index: 0, src: '/imports/manh/chapter-1/001.jpg' },
            { index: 1, src: '/imports/manh/chapter-1/002.jpg' }
          ]
        }
      ]
    },
    {
      id: 'draft-1',
      title: 'Bản Nháp',
      status: 'draft',
      tags: ['Manhwa'],
      chapters: []
    }
  ]
};

test('normalizes series into public production-shaped fields', () => {
  const series = normalizeSeries(catalog.series[0]);

  assert.equal(series.slug, 'manh-nhat-lich-su');
  assert.deepEqual(series.tags.map((tag) => tag.slug), ['manhua', 'action']);
  assert.equal(series.chapters[0].slug, 'chapter-1');
  assert.equal(series.chapters[0].pages[1].order, 1);
  assert.equal(series.chapters[0].pages[1].imageUrl, '/imports/manh/chapter-1/002.jpg');
});

test('finds public series and chapters by stable slug', () => {
  const series = findSeriesBySlug(catalog, 'manh-nhat-lich-su');
  const chapter = findChapterBySlug(series, 'chapter-1');

  assert.equal(series.id, 'manh-nhat-1');
  assert.equal(chapter.id, 'chapter-1');
  assert.equal(findSeriesBySlug(catalog, 'ban-nhap'), null);
});

test('builds SEO discovery collections and tag index from public content only', () => {
  const home = buildHomeCollections(catalog);
  const tags = buildTagIndex(catalog);

  assert.deepEqual(home.hot.map((series) => series.slug), ['manh-nhat-lich-su']);
  assert.deepEqual(tags.map((tag) => tag.slug), ['action', 'manhua']);
});

test('admin update applies metadata, tags, aliases, status, and schedule without dropping chapters', () => {
  const { catalog: nextCatalog, series } = updateSeriesInCatalog(catalog, 'manh-nhat-1', {
    title: 'Mạnh Nhất Lịch Sử Remaster',
    aliases: ['Mạnh Nhất', 'Strongest Ever'],
    tags: ['Manhua', 'Tu Tiên'],
    status: 'public',
    crawlSchedule: { enabled: true, intervalHours: 6 }
  });

  assert.equal(series.title, 'Mạnh Nhất Lịch Sử Remaster');
  assert.deepEqual(series.aliases, ['Mạnh Nhất', 'Strongest Ever']);
  assert.deepEqual(series.tags.map((tag) => tag.slug), ['manhua', 'tu-tien']);
  assert.equal(series.chapters.length, 1);
  assert.equal(nextCatalog.series[0].crawlSchedule.intervalHours, 6);
});

test('server events update ranking stats and keep highest read depth', () => {
  const viewed = recordEventOnCatalog(catalog, {
    type: 'pageview',
    seriesSlug: 'manh-nhat-lich-su'
  });
  const readDepth = recordEventOnCatalog(viewed.catalog, {
    type: 'read_depth',
    seriesSlug: 'manh-nhat-lich-su',
    value: 62
  });
  const adView = recordEventOnCatalog(readDepth.catalog, {
    type: 'ad_view',
    seriesSlug: 'manh-nhat-lich-su'
  });

  const series = adView.series;
  assert.equal(series.stats.views, 11);
  assert.equal(series.stats.readDepth, 62);
  assert.equal(series.stats.adViews, 1);
});
