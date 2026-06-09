import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDesktopFeatureSlides,
  loadHomeReadingSeries
} from '../public/routes/home.mjs';

test('desktop feature slides prioritize recently updated series over old hot series', () => {
  const slides = buildDesktopFeatureSlides({
    popular: [
      { id: 'old-hot', title: 'Old Hot' },
      { id: 'shared', title: 'Shared Hot' }
    ],
    updated: [
      { id: 'new-one', title: 'New One' },
      { id: 'shared', title: 'Shared Updated' }
    ]
  });

  assert.deepEqual(slides.map((series) => series.id), ['new-one', 'shared', 'old-hot']);
});

test('desktop feature slides keep the current reading series first', () => {
  const slides = buildDesktopFeatureSlides({
    lastSeries: { id: 'reading-now', title: 'Reading Now' },
    popular: [{ id: 'old-hot', title: 'Old Hot' }],
    updated: [{ id: 'new-one', title: 'New One' }]
  });

  assert.deepEqual(slides.map((series) => series.id), ['reading-now', 'new-one', 'old-hot']);
});

test('home reading series use full series detail even when the series is already in home collections', async () => {
  const homeSeries = [{
    id: 'reading-now',
    slug: 'reading-now',
    title: 'Reading Now',
    chapters: [
      { id: 'chapter-1', imported: true, pageCount: 1 },
      { id: 'chapter-2', imported: true, pageCount: 1 },
      { id: 'chapter-3', imported: true, pageCount: 1 }
    ]
  }];
  const fullSeries = {
    ...homeSeries[0],
    chapters: Array.from({ length: 8 }, (_, index) => ({
      id: `chapter-${index + 1}`,
      imported: true,
      pageCount: 1
    }))
  };
  const calls = [];

  const result = await loadHomeReadingSeries({
    homeSeries,
    historyIds: ['reading-now'],
    lastSeriesId: 'reading-now',
    loadProgress: (seriesId) => ({ seriesId, chapterId: 'chapter-6' }),
    fetchJson: async (path) => {
      calls.push(path);
      return fullSeries;
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(result.readingSeries[0].series.chapters.length, 8);
  assert.equal(result.readingSeries[0].progress.chapterId, 'chapter-6');
  assert.equal(result.lastSeries.id, 'reading-now');
});
