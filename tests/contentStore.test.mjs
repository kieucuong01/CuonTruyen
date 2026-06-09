import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adminCatalog,
  buildReaderChapterPayload,
  buildHomeCollections,
  buildTagIndex,
  buildTagPage,
  findChapterBySlug,
  findSeriesBySlug,
  normalizeSeries,
  publicCatalog,
  publicSeriesDetail,
  recordEventOnCatalog,
  updateChapterInCatalog,
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
        },
        {
          id: 'chapter-2',
          label: 'Chapter 2',
          imported: true,
          pageCount: 1,
          pages: [
            { index: 0, src: '/imports/manh/chapter-2/001.jpg' }
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

test('normalizes local imported image URLs through the configured public base URL', () => {
  const previousBaseUrl = process.env.PUBLIC_IMPORTS_BASE_URL;
  const previousEnabled = process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED;
  process.env.PUBLIC_IMPORTS_BASE_URL = 'https://comic-api.example.com/';
  process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED = 'true';

  try {
    const series = normalizeSeries(catalog.series[0]);

    assert.equal(series.chapters[0].pages[1].imageUrl, 'https://comic-api.example.com/imports/manh/chapter-1/002.jpg');
    assert.equal(series.chapters[0].pages[1].storageKey, '/imports/manh/chapter-1/002.jpg');
  } finally {
    if (previousBaseUrl === undefined) delete process.env.PUBLIC_IMPORTS_BASE_URL;
    else process.env.PUBLIC_IMPORTS_BASE_URL = previousBaseUrl;
    if (previousEnabled === undefined) delete process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED;
    else process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED = previousEnabled;
  }
});

test('keeps local import URLs local unless public base rewrite is enabled or production', () => {
  const previousBaseUrl = process.env.PUBLIC_IMPORTS_BASE_URL;
  const previousEnabled = process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED;
  const previousVercel = process.env.VERCEL;
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.PUBLIC_IMPORTS_BASE_URL = 'https://s3.example.com/comics';
  delete process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED;
  delete process.env.VERCEL;
  process.env.NODE_ENV = 'development';

  try {
    assert.equal(
      normalizeSeries(catalog.series[0]).chapters[0].pages[0].imageUrl,
      '/imports/manh/chapter-1/001.jpg'
    );

    process.env.VERCEL = '1';
    assert.equal(
      normalizeSeries(catalog.series[0]).chapters[0].pages[0].imageUrl,
      'https://s3.example.com/comics/imports/manh/chapter-1/001.jpg'
    );
  } finally {
    if (previousBaseUrl === undefined) delete process.env.PUBLIC_IMPORTS_BASE_URL;
    else process.env.PUBLIC_IMPORTS_BASE_URL = previousBaseUrl;
    if (previousEnabled === undefined) delete process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED;
    else process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED = previousEnabled;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test('finds public series and chapters by stable slug', () => {
  const series = findSeriesBySlug(catalog, 'manh-nhat-lich-su');
  const chapter = findChapterBySlug(series, 'chapter-1');

  assert.equal(series.id, 'manh-nhat-1');
  assert.equal(chapter.id, 'chapter-1');
  assert.equal(findSeriesBySlug(catalog, 'ban-nhap'), null);
});

test('falls back to chapter id when a source chapter has no usable slug', () => {
  const series = normalizeSeries({
    title: 'Demo',
    status: 'public',
    chapters: [
      {
        id: 'doc-tu-dau',
        label: '!!!',
        imported: true,
        pages: [{ src: '/imports/demo/doc-tu-dau/001.jpg' }]
      }
    ]
  });

  assert.equal(series.chapters[0].slug, 'doc-tu-dau');
  assert.equal(findChapterBySlug(series, 'doc-tu-dau').id, 'doc-tu-dau');
});

test('builds SEO discovery collections and tag index from public content only', () => {
  const home = buildHomeCollections(catalog);
  const tags = buildTagIndex(catalog);

  assert.deepEqual(home.hot.map((series) => series.slug), ['manh-nhat-lich-su']);
  assert.equal(home.hot[0].chapters[0].pages, undefined);
  assert.equal(home.hot[0].pageCount, 3);
  assert.deepEqual(tags.map((tag) => tag.slug), ['action', 'manhua', 'truyen-trung']);
  assert.equal(tags.find((tag) => tag.slug === 'truyen-trung').seriesCount, 1);
});

test('buildTagPage resolves Manhua/Manhwa origin aliases for SEO landing pages', () => {
  const manhuaPage = buildTagPage(catalog, 'truyen-trung');
  const manhwaPage = buildTagPage(catalog, 'truyen-han');

  assert.equal(manhuaPage.tag.name, 'Truyện Trung');
  assert.deepEqual(manhuaPage.series.map((series) => series.slug), ['manh-nhat-lich-su']);
  assert.equal(manhwaPage, null);
});

test('public series detail returns chapter summaries without page arrays', () => {
  const series = publicSeriesDetail(catalog.series[0]);

  assert.equal(series.slug, 'manh-nhat-lich-su');
  assert.equal(series.chapters.length, 2);
  assert.equal(series.chapters[0].pages, undefined);
  assert.equal(series.chapters[0].pageCount, 2);
});

test('public catalog can return lightweight series cards while preserving counts', () => {
  const manyChapterCatalog = {
    series: [
      {
        ...catalog.series[0],
        chapters: Array.from({ length: 8 }, (_, index) => ({
          id: `chapter-${index + 1}`,
          label: `Chapter ${index + 1}`,
          status: 'public',
          imported: true,
          pageCount: index + 1,
          pages: [{ src: `/imports/manh/chapter-${index + 1}/001.jpg` }]
        }))
      }
    ]
  };

  const publicList = publicCatalog(manyChapterCatalog, { chapterLimit: 3 });

  assert.equal(publicList.series[0].chapterCount, 8);
  assert.equal(publicList.series[0].importedChapterCount, 8);
  assert.equal(publicList.series[0].chapters.length, 3);
  assert.deepEqual(publicList.series[0].chapters.map((chapter) => chapter.id), ['chapter-1', 'chapter-2', 'chapter-3']);
});

test('reader chapter payload includes only the requested chapter window pages', () => {
  const payload = buildReaderChapterPayload(catalog, 'manh-nhat-lich-su', 'chapter-1', { window: 1 });

  assert.equal(payload.series.chapters, undefined);
  assert.equal(payload.chapter.id, 'chapter-1');
  assert.equal(payload.chapter.pages.length, 2);
  assert.equal(payload.chapters.length, 2);
  assert.equal(payload.chapters[0].id, 'chapter-1');
  assert.equal(payload.chapters[1].id, 'chapter-2');
  assert.equal(payload.nextChapter.id, 'chapter-2');
});

test('public catalog, detail, and reader payload exclude hidden chapters', () => {
  const hiddenCatalog = {
    series: [
      {
        ...catalog.series[0],
        chapters: [
          catalog.series[0].chapters[0],
          {
            ...catalog.series[0].chapters[1],
            status: 'removed'
          }
        ]
      }
    ]
  };

  const publicList = publicCatalog(hiddenCatalog);
  const detail = publicSeriesDetail(hiddenCatalog.series[0]);
  const payload = buildReaderChapterPayload(hiddenCatalog, 'manh-nhat-lich-su', 'chapter-1', { window: 1 });

  assert.deepEqual(publicList.series[0].chapters.map((chapter) => chapter.id), ['chapter-1']);
  assert.deepEqual(detail.chapters.map((chapter) => chapter.id), ['chapter-1']);
  assert.equal(findChapterBySlug(detail, 'chapter-2'), null);
  assert.deepEqual(payload.chapters.map((chapter) => chapter.id), ['chapter-1']);
  assert.equal(payload.nextChapter, null);
});

test('admin catalog keeps hidden content visible for review', () => {
  const hiddenCatalog = {
    series: [
      {
        ...catalog.series[0],
        status: 'removed',
        chapters: [
          {
            ...catalog.series[0].chapters[0],
            status: 'removed'
          }
        ]
      }
    ]
  };

  const admin = adminCatalog(hiddenCatalog);
  const publicList = publicCatalog(hiddenCatalog);

  assert.equal(publicList.series.length, 0);
  assert.equal(admin.series[0].status, 'removed');
  assert.equal(admin.series[0].chapters[0].status, 'removed');
});

test('reader payload rejects chapters that only have stale page counts without cached pages', () => {
  const staleCatalog = {
    series: [
      {
        id: 'demo',
        slug: 'demo',
        title: 'Demo',
        status: 'public',
        coverUrl: '/imports/demo/cover.jpg',
        chapters: [
          {
            id: 'chapter-1',
            label: 'Chapter 1',
            imported: true,
            pageCount: 20,
            pages: []
          },
          {
            id: 'chapter-2',
            label: 'Chapter 2',
            imported: true,
            pageCount: 1,
            pages: [{ src: '/imports/demo/chapter-2/001.jpg' }]
          }
        ]
      }
    ]
  };

  const detail = publicSeriesDetail(staleCatalog.series[0]);

  assert.equal(detail.chapters[0].imported, false);
  assert.equal(detail.chapters[0].pageCount, 0);
  assert.equal(buildReaderChapterPayload(staleCatalog, 'demo', 'chapter-1'), null);
  assert.equal(buildReaderChapterPayload(staleCatalog, 'demo', 'chapter-2').chapter.id, 'chapter-2');
});

test('reader payload can select chapters from DB metadata and hydrate only the current window', () => {
  const catalog = {
    series: [{
      id: 'demo',
      title: 'Demo',
      slug: 'demo',
      status: 'public',
      chapters: [
        { id: 'chapter-1', slug: 'chapter-1', status: 'public', imported: true, pageCount: 12 },
        {
          id: 'chapter-2',
          slug: 'chapter-2',
          status: 'public',
          imported: true,
          pageCount: 1,
          pages: [{ src: '/imports/demo/chapter-2/001.webp' }]
        },
        {
          id: 'chapter-3',
          slug: 'chapter-3',
          status: 'public',
          imported: true,
          pageCount: 1,
          pages: [{ src: '/imports/demo/chapter-3/001.webp' }]
        }
      ]
    }]
  };

  const payload = buildReaderChapterPayload(catalog, 'demo', 'chapter-2', { window: 1 });

  assert.equal(payload.chapter.id, 'chapter-2');
  assert.equal(payload.chapter.pages.length, 1);
  assert.deepEqual(payload.chapters.map((chapter) => chapter.id), ['chapter-2', 'chapter-3']);
  assert.equal(payload.previousChapter.id, 'chapter-1');
  assert.equal(payload.nextChapter.id, 'chapter-3');
});

test('public and admin catalog expose local cover thumbnails', () => {
  const thumbnailCatalog = {
    series: [
      {
        id: 'demo',
        slug: 'demo',
        title: 'Demo',
        status: 'public',
        coverUrl: 'https://example.com/original-cover.jpg',
        thumbnailUrl: '/imports/demo/_cover/cover.webp',
        coverThumbnail: {
          sourceType: 'source-cover',
          width: 320,
          height: 480
        },
        chapters: [
          {
            id: 'chapter-1',
            label: 'Chapter 1',
            status: 'public',
            imported: true,
            pageCount: 1,
            pages: [{ src: '/imports/demo/chapter-1/001.webp' }]
          }
        ]
      }
    ]
  };

  const publicList = publicCatalog(thumbnailCatalog);
  const adminList = adminCatalog(thumbnailCatalog);
  const detail = publicSeriesDetail(thumbnailCatalog.series[0]);

  assert.equal(publicList.series[0].thumbnailUrl, '/imports/demo/_cover/cover.webp');
  assert.equal(adminList.series[0].thumbnailUrl, '/imports/demo/_cover/cover.webp');
  assert.equal(detail.coverThumbnail.sourceType, 'source-cover');
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
  assert.equal(series.chapters.length, 2);
  assert.equal(nextCatalog.series[0].crawlSchedule.intervalHours, 6);
});

test('admin chapter moderation updates one chapter without dropping pages', () => {
  const { catalog: nextCatalog, chapter } = updateChapterInCatalog(catalog, 'manh-nhat-1', 'chapter-1', {
    title: 'Chapter 1 Remastered',
    status: 'removed',
    takedownReason: 'Owner request'
  });

  assert.equal(chapter.title, 'Chapter 1 Remastered');
  assert.equal(chapter.status, 'removed');
  assert.equal(nextCatalog.series[0].chapters[0].pages.length, 2);
  assert.equal(nextCatalog.series[0].chapters[1].id, 'chapter-2');
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
