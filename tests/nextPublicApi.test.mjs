import test from 'node:test';
import assert from 'node:assert/strict';

import {
  nextPublicCatalogApi,
  nextPublicHomeApi,
  nextPublicReaderApi,
  nextPublicSearchApi,
  nextPublicSeriesApi,
  nextPublicTagApi
} from '../src/lib/server/public-api.mjs';

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
          pages: [{ imageUrl: '/imports/public/chapter-1/001.jpg' }]
        },
        {
          id: 'c2',
          title: 'Draft Chapter',
          slug: 'draft-chapter',
          status: 'draft',
          imported: true,
          pages: [{ imageUrl: '/imports/public/chapter-2/001.jpg' }]
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

test('next public catalog API exposes only public series', async () => {
  const response = await nextPublicCatalogApi({ catalog });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.series.map((series) => series.slug), ['public-story']);
});

test('next public series API supports query/path lookup and hides drafts', async () => {
  const publicResponse = await nextPublicSeriesApi('public-story', { catalog });
  const draftResponse = await nextPublicSeriesApi('draft-story', { catalog });

  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.body.slug, 'public-story');
  assert.equal(publicResponse.body.chapters.length, 1);
  assert.equal(draftResponse.status, 404);
});

test('next public reader API returns chapter pages and honors hidden chapter filtering', async () => {
  const publicResponse = await nextPublicReaderApi({
    seriesSlug: 'public-story',
    chapterSlug: 'chapter-1',
    window: 1
  }, { catalog });
  const hiddenResponse = await nextPublicReaderApi({
    seriesSlug: 'public-story',
    chapterSlug: 'draft-chapter',
    window: 1
  }, { catalog });

  assert.equal(publicResponse.status, 200);
  assert.equal(publicResponse.body.chapter.id, 'c1');
  assert.equal(publicResponse.body.chapter.pages.length, 1);
  assert.equal(hiddenResponse.status, 404);
});

test('next public home, tag, and search APIs reuse public catalog filters', async () => {
  const home = await nextPublicHomeApi({ catalog });
  const tag = await nextPublicTagApi('action', { catalog });
  const search = await nextPublicSearchApi('public', { catalog });

  assert.equal(home.status, 200);
  assert.deepEqual(home.body.updated.map((series) => series.slug), ['public-story']);
  assert.equal(tag.status, 200);
  assert.deepEqual(tag.body.series.map((series) => series.slug), ['public-story']);
  assert.equal(search.status, 200);
  assert.deepEqual(search.body.series.map((series) => series.slug), ['public-story']);
});
