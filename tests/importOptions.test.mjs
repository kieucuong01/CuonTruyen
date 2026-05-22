import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeImportPayload } from '../server/importOptions.mjs';

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
});
