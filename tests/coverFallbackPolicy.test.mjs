import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const IMPORTER_SOURCE = await fs.readFile(new URL('../server/importer.mjs', import.meta.url), 'utf8');
const BACKFILL_SOURCE = await fs.readFile(new URL('../scripts/backfill-cover-thumbnails.mjs', import.meta.url), 'utf8');

test('importer only uses first-page cover fallback when explicitly enabled', () => {
  assert.match(IMPORTER_SOURCE, /CRAWL_ALLOW_FIRST_PAGE_COVER_FALLBACK/);
  assert.match(IMPORTER_SOURCE, /allowFirstPageCoverFallback/);
  assert.match(IMPORTER_SOURCE, /if \(!coverThumbnail && fallbackCoverImagePath && allowFirstPageCoverFallback\)/);
});

test('cover thumbnail backfill disables first-page fallback by default', () => {
  assert.match(BACKFILL_SOURCE, /allowFirstPageFallback: false/);
  assert.match(BACKFILL_SOURCE, /--allow-first-page-fallback/);
  assert.match(BACKFILL_SOURCE, /if \(!allowFirstPageFallback\) return null/);
});
