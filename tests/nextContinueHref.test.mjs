import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import * as continueHref from '../src/components/public/continueHref.mjs';

const { resolveContinueHref } = continueHref;

test('resolveContinueHref uses the server-provided public index instead of an API fetch', () => {
  const href = resolveContinueHref({
    seriesId: 'public-1',
    chapterId: 'c2',
    seriesList: [
      {
        id: 'public-1',
        slug: 'public-story',
        chapters: [
          { id: 'c1', slug: 'chapter-1' },
          { id: 'c2', slug: 'chapter-2' }
        ]
      }
    ]
  });

  assert.equal(href, '/truyen/public-story/chapter-2');
});

test('resolveContinueHref returns empty when the saved series is not in the public index', () => {
  assert.equal(resolveContinueHref({ seriesId: 'draft-1', chapterId: 'c1', seriesList: [] }), '');
});

test('resolveContinueHrefWithFallback fetches only the saved series when no public index is serialized', async () => {
  assert.equal(typeof continueHref.resolveContinueHrefWithFallback, 'function');

  const calls = [];
  const href = await continueHref.resolveContinueHrefWithFallback({
    seriesId: 'public-1',
    chapterId: 'c2',
    fetchSeries: async (seriesId) => {
      calls.push(seriesId);
      return {
        id: 'public-1',
        slug: 'public-story',
        chapters: [
          { id: 'c1', slug: 'chapter-1' },
          { id: 'c2', slug: 'chapter-2' }
        ]
      };
    }
  });

  assert.deepEqual(calls, ['public-1']);
  assert.equal(href, '/truyen/public-story/chapter-2');
});

test('home continue island stays payload-light and does not serialize the public catalog index', () => {
  const homeSource = fs.readFileSync('src/app/page.tsx', 'utf8');

  assert.match(homeSource, /<ContinueIsland\s*\/>/);
  assert.doesNotMatch(homeSource, /seriesList=\{home\.continueSeries/);
});
