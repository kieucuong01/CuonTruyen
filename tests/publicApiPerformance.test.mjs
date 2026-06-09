import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const serverSource = () => fs.readFileSync('server/index.mjs', 'utf8');

test('public API responses are allowed to cache at the CDN edge', () => {
  const source = serverSource();

  assert.match(source, /PUBLIC_API_CACHE_CONTROL/);
  assert.match(source, /s-maxage/);
  assert.match(source, /stale-while-revalidate/);
  assert.match(source, /cache-control': cacheControl/);
});

test('series detail API uses direct DB lookup instead of loading the full catalog', () => {
  const source = serverSource();

  assert.match(source, /getSeries\(id, \{ includePages: false, includeDraft: false \}\)/);
  assert.doesNotMatch(
    source,
    /const catalog = await readCatalog\(\{ includePages: false \}\);\s*const series = findSeriesBySlug\(catalog, id\) \|\| await getSeries\(id, \{ includePages: false \}\);/
  );
});

test('reader API hydrates only selected chapter pages', () => {
  const source = serverSource();

  assert.match(source, /getSeries\(decodeURIComponent\(seriesSlug\), \{\s*includePages: false,/);
  assert.match(source, /getChapterPages\(series\.id, selection\.chapterIds\)/);
  assert.doesNotMatch(source, /readerCatalogForSeries\(seriesSlug\)\)/);
});
