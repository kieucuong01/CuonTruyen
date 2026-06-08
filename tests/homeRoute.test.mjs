import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDesktopFeatureSlides } from '../public/routes/home.mjs';

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
