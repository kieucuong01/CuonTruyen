import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProductionCheckTargets,
  checkProductionTargets,
  firstPageUrl,
  resolveProductionAssetUrl
} from '../server/productionCheck.mjs';

const sampleSeries = {
  id: 's1',
  slug: 'sample-series',
  title: 'Sample Series',
  thumbnailUrl: '/imports/sample-series/_cover/cover.webp',
  chapters: [{
    id: 'c1',
    slug: 'chuong-1',
    status: 'public',
    pages: [{ imageUrl: '/imports/sample-series/chuong-1/001.webp' }]
  }]
};

test('production check targets include series page, cover, and chapter image', () => {
  const targets = buildProductionCheckTargets({
    series: sampleSeries,
    productionUrl: 'https://cuontruyen.vercel.app/truyen/sample-series',
    importsBaseUrl: 'https://s3.vn-hcm-1.vietnix.cloud/cuontruyen/imports'
  });

  assert.deepEqual(targets.map((target) => target.key), [
    'series-page',
    'cover-image',
    'chapter-image'
  ]);
  assert.equal(targets[1].url, 'https://s3.vn-hcm-1.vietnix.cloud/cuontruyen/imports/sample-series/_cover/cover.webp');
  assert.equal(targets[2].url, 'https://s3.vn-hcm-1.vietnix.cloud/cuontruyen/imports/sample-series/chuong-1/001.webp');
});

test('production asset URL resolver keeps absolute URLs and maps local imports to S3 imports base', () => {
  assert.equal(
    resolveProductionAssetUrl('https://cdn.example.test/a.webp'),
    'https://cdn.example.test/a.webp'
  );
  assert.equal(
    resolveProductionAssetUrl('/imports/demo/001.webp', {
      importsBaseUrl: 'https://s3.example.test/bucket/imports'
    }),
    'https://s3.example.test/bucket/imports/demo/001.webp'
  );
});

test('firstPageUrl accepts object and string page shapes', () => {
  assert.equal(firstPageUrl({ pages: [{ src: '/imports/a.webp' }] }), '/imports/a.webp');
  assert.equal(firstPageUrl({ pages: ['/imports/b.webp'] }), '/imports/b.webp');
});

test('checkProductionTargets reports failed targets while preserving successful checks', async () => {
  const result = await checkProductionTargets([
    { key: 'ok-page', label: 'OK page', kind: 'html', required: true, url: 'https://example.test/ok' },
    { key: 'bad-image', label: 'Bad image', kind: 'image', required: true, url: 'https://example.test/missing' }
  ], {
    fetchImpl: async (url) => ({
      ok: url.includes('/ok'),
      status: url.includes('/ok') ? 200 : 404,
      headers: { get: () => url.includes('/ok') ? 'text/html' : 'image/webp' }
    })
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.checks.map((check) => [check.key, check.ok, check.status]), [
    ['ok-page', true, 200],
    ['bad-image', false, 404]
  ]);
});
