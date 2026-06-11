import assert from 'node:assert/strict';
import test from 'node:test';

import {
  firstReadablePageImage,
  renderAdminSeriesCard,
  renderAdminSeriesEditor,
  renderStatusSelect,
  resolveProductionSeriesUrl
} from '../public/routes/adminSeriesEditorView.mjs';

const baseSeries = {
  id: 'series <1>',
  slug: 'series-slug',
  title: 'Series <Title>',
  status: 'public',
  coverUrl: '/imports/cover.webp',
  sourceUrl: 'https://source.test/series',
  importMode: 'image_url',
  assetStatus: 'external',
  aliases: ['Alias A'],
  tags: ['manual'],
  description: 'SEO <copy>',
  crawlSchedule: { enabled: true, intervalHours: 6 },
  chapters: [{
    id: 'chapter <1>',
    slug: 'chapter-one',
    title: 'Chapter <One>',
    status: 'public',
    pageCount: 3,
    pages: [{ imageUrl: '/imports/page-001.webp' }]
  }]
};

test('admin series editor view resolves production URL from configured base', () => {
  assert.equal(
    resolveProductionSeriesUrl(baseSeries, { productionBaseUrl: 'https://prod.test/' }),
    'https://prod.test/truyen/series-slug'
  );
  assert.equal(resolveProductionSeriesUrl({ slug: '' }, { productionBaseUrl: 'https://prod.test' }), '');
});

test('admin series card renders escaped actions and production controls', () => {
  const html = renderAdminSeriesCard(baseSeries, {
    localOps: true,
    productionStatus: { storage: { productionPostgres: { configured: true } } },
    runtimeConfig: { productionBaseUrl: 'https://prod.test' }
  });

  assert.match(html, /admin-series-list-card/);
  assert.match(html, /Series &lt;Title&gt;/);
  assert.doesNotMatch(html, /Series <Title>/);
  assert.match(html, /href="\/admin\/series\/series &lt;1&gt;"/);
  assert.match(html, /data-update-chapters="series &lt;1&gt;"/);
  assert.match(html, /data-refresh-image-urls="series &lt;1&gt;"/);
  assert.match(html, /data-publish-production="series &lt;1&gt;"/);
  assert.match(html, /data-production-url="https:\/\/prod\.test\/truyen\/series-slug"/);
});

test('admin series editor renders metadata, chapter rows, and DB warning without leaking HTML', () => {
  const html = renderAdminSeriesEditor(baseSeries, {
    localOps: true,
    productionStatus: { storage: { productionPostgres: { configured: false } } },
    chapterHrefSegment: (chapter) => `chapter/${chapter.slug}`
  });

  assert.match(html, /data-admin-series="series &lt;1&gt;"/);
  assert.match(html, /SEO &lt;copy&gt;/);
  assert.match(html, /Missing PRODUCTION_CATALOG_DATABASE_URL/);
  assert.match(html, /name="chapterTitle:chapter &lt;1&gt;"/);
  assert.match(html, /href="\/truyen\/series-slug\/chapter\/chapter-one"/);
  assert.match(html, /data-refresh-image-urls="series &lt;1&gt;"/);
  assert.doesNotMatch(html, /<copy>/);
});

test('admin series editor helpers keep cover fallback and status select stable', () => {
  assert.equal(firstReadablePageImage(baseSeries), '/imports/page-001.webp');

  const missingCoverHtml = renderAdminSeriesEditor({
    ...baseSeries,
    coverUrl: '',
    chapters: [{ id: 'c1', status: 'public', pages: [{ src: '/imports/fallback.webp' }] }]
  }, {
    localOps: false,
    chapterHrefSegment: (chapter) => chapter.id
  });

  assert.match(missingCoverHtml, /src="\/imports\/fallback\.webp"/);
  assert.match(missingCoverHtml, /Production admin/);
  assert.doesNotMatch(missingCoverHtml, /data-update-chapters=/);

  assert.match(renderStatusSelect('status', 'removed'), /option value="removed" selected/);
});
