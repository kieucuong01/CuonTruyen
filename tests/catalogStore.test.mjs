import test from 'node:test';
import assert from 'node:assert/strict';

import { publicImportPath, publicImportUrl } from '../server/catalogStore.mjs';

test('publicImportUrl keeps local imports local by default', () => {
  const previousBase = process.env.PUBLIC_IMPORTS_BASE_URL;
  const previousEnabled = process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED;
  process.env.PUBLIC_IMPORTS_BASE_URL = 'https://s3.example.test/bucket';
  delete process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED;

  assert.equal(
    publicImportUrl('https://s3.vn-hcm-1.vietnix.cloud/cuontruyen/imports/gacha/chap/001.jpg'),
    '/imports/gacha/chap/001.jpg'
  );
  assert.equal(
    publicImportPath('gacha', 'chap', '001.jpg'),
    '/imports/gacha/chap/001.jpg'
  );

  restoreEnv(previousBase, previousEnabled);
});

test('publicImportUrl uses public imports base only when explicitly enabled', () => {
  const previousBase = process.env.PUBLIC_IMPORTS_BASE_URL;
  const previousEnabled = process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED;
  process.env.PUBLIC_IMPORTS_BASE_URL = 'https://s3.example.test/bucket';
  process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED = 'true';

  assert.equal(
    publicImportUrl('/imports/gacha/chap/001.jpg'),
    'https://s3.example.test/bucket/imports/gacha/chap/001.jpg'
  );
  assert.equal(
    publicImportUrl('https://s3.vn-hcm-1.vietnix.cloud/cuontruyen/imports/gacha/chap/001.jpg'),
    'https://s3.example.test/bucket/imports/gacha/chap/001.jpg'
  );

  restoreEnv(previousBase, previousEnabled);
});

function restoreEnv(base, enabled) {
  if (base === undefined) delete process.env.PUBLIC_IMPORTS_BASE_URL;
  else process.env.PUBLIC_IMPORTS_BASE_URL = base;
  if (enabled === undefined) delete process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED;
  else process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED = enabled;
}
