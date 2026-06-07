import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  nextPublicHomeData,
  nextPublicReaderData,
  nextPublicSeriesData,
  nextPublicTagData
} from '../src/lib/server/public-data.mjs';

test('next public data excludes draft and removed content', async () => {
  const catalog = {
    series: [
      {
        id: 'public-1',
        title: 'Public Story',
        slug: 'public-story',
        status: 'public',
        tags: [{ name: 'Action', slug: 'action' }],
        chapters: [
          {
            id: 'c1',
            title: 'Chapter 1',
            slug: 'chapter-1',
            status: 'public',
            imported: true,
            pages: [{ imageUrl: '/imports/a/1.jpg' }]
          },
          {
            id: 'c2',
            title: 'Draft Chapter',
            slug: 'draft-chapter',
            status: 'draft',
            imported: true,
            pages: [{ imageUrl: '/imports/a/2.jpg' }]
          }
        ]
      },
      {
        id: 'draft-1',
        title: 'Draft Story',
        slug: 'draft-story',
        status: 'draft',
        tags: [{ name: 'Action', slug: 'action' }],
        chapters: []
      }
    ]
  };

  const home = await nextPublicHomeData({ catalog });
  assert.deepEqual(home.updated.map((item) => item.slug), ['public-story']);
  assert.equal(home.continueSeries, undefined);

  const series = await nextPublicSeriesData('public-story', { catalog });
  assert.equal(series?.chapters.length, 1);
  assert.equal(series?.chapters[0].slug, 'chapter-1');

  const reader = await nextPublicReaderData('public-story', 'chapter-1', { catalog });
  assert.deepEqual(reader?.series.chapters.map((chapter) => chapter.slug), ['chapter-1']);

  const tag = await nextPublicTagData('action', { catalog });
  assert.deepEqual(tag?.series.map((item) => item.slug), ['public-story']);
});

test('next public data reads page arrays only for reader payloads', async () => {
  const catalog = {
    series: [
      {
        id: 'public-1',
        title: 'Public Story',
        slug: 'public-story',
        status: 'public',
        tags: [{ name: 'Action', slug: 'action' }],
        chapters: [
          {
            id: 'c1',
            title: 'Chapter 1',
            slug: 'chapter-1',
            status: 'public',
            imported: true,
            pages: [{ imageUrl: '/imports/a/1.jpg' }]
          }
        ]
      }
    ]
  };
  const calls = [];
  const readCatalog = async (options) => {
    calls.push(options);
    return catalog;
  };

  await nextPublicHomeData({ readCatalog });
  await nextPublicSeriesData('public-story', { readCatalog });
  await nextPublicTagData('action', { readCatalog });
  await nextPublicReaderData('public-story', 'chapter-1', { readCatalog });

  assert.deepEqual(calls.map((call) => call.includePages), [false, false, false, true]);
  assert.equal(Object.hasOwn(await nextPublicHomeData({ readCatalog }), 'continueSeries'), false);
});

test('Next public pages use cached data helpers for metadata and render reuse', () => {
  const dataSource = fs.readFileSync('src/lib/server/public-data.mjs', 'utf8');
  assert.match(dataSource, /from ['"]react['"]/);
  for (const exportedName of [
    'cachedNextPublicHomeData',
    'cachedNextPublicSeriesData',
    'cachedNextPublicReaderData',
    'cachedNextPublicTagData'
  ]) {
    assert.match(dataSource, new RegExp(`export const ${exportedName} = cache\\(`));
  }

  for (const [routeFile, cachedName, rawName] of [
    ['src/app/page.tsx', 'cachedNextPublicHomeData', 'nextPublicHomeData'],
    ['src/app/truyen/[seriesSlug]/page.tsx', 'cachedNextPublicSeriesData', 'nextPublicSeriesData'],
    ['src/app/truyen/[seriesSlug]/[chapterSlug]/page.tsx', 'cachedNextPublicReaderData', 'nextPublicReaderData'],
    ['src/app/the-loai/[tagSlug]/page.tsx', 'cachedNextPublicTagData', 'nextPublicTagData']
  ]) {
    const routeSource = fs.readFileSync(routeFile, 'utf8');
    assert.match(routeSource, new RegExp(`\\b${cachedName}\\b`), `${routeFile} should use ${cachedName}`);
    assert.doesNotMatch(routeSource, new RegExp(`\\b${rawName}\\(`), `${routeFile} should not call ${rawName} directly`);
  }
});
