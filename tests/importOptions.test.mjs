import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeImportBatchPayload, normalizeImportPayload, parseImportUrls } from '../server/importOptions.mjs';

test('normalizeImportPayload preserves zero as unlimited chapters and pages', () => {
  const payload = normalizeImportPayload({
    url: 'https://truyenqqko.com/truyen-tranh/manh-nhat-lich-su-5968',
    maxChapters: 0,
    maxPages: 0
  });

  assert.equal(payload.maxChapters, 0);
  assert.equal(payload.maxPages, 0);
});

test('normalizeImportPayload uses defaults only when limits are missing', () => {
  const payload = normalizeImportPayload({
    url: 'https://truyenqqko.com/truyen-tranh/manh-nhat-lich-su-5968'
  });

  assert.equal(payload.maxChapters, 2);
  assert.equal(payload.maxPages, 8);
  assert.equal(payload.assetMode, 'image_url');
});

test('normalizeImportPayload accepts full download mode explicitly', () => {
  const payload = normalizeImportPayload({
    url: 'https://truyenqqko.com/truyen-tranh/manh-nhat-lich-su-5968',
    assetMode: 'full_download'
  });

  assert.equal(payload.assetMode, 'full_download');
});

test('parseImportUrls accepts multiple lines, commas, spaces, and removes duplicates', () => {
  assert.deepEqual(parseImportUrls(`
    https://example.test/a
    https://example.test/b, https://example.test/a https://example.test/c
  `), [
    'https://example.test/a',
    'https://example.test/b',
    'https://example.test/c'
  ]);
});

test('normalizeImportBatchPayload applies the same limits to every URL', () => {
  const payloads = normalizeImportBatchPayload({
    url: 'https://example.test/a\nhttps://example.test/b',
    maxChapters: 3,
    maxPages: 0
  });

  assert.deepEqual(payloads, [
    { url: 'https://example.test/a', maxChapters: 3, maxPages: 0, assetMode: 'image_url' },
    { url: 'https://example.test/b', maxChapters: 3, maxPages: 0, assetMode: 'image_url' }
  ]);
});
