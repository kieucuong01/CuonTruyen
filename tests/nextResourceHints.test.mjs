import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('publicImportsOrigin resolves the public imports origin without bucket paths', async () => {
  const { publicImportsOrigin } = await import('../src/lib/shared/resource-hints.mjs');

  assert.equal(
    publicImportsOrigin({ PUBLIC_IMPORTS_BASE_URL: 'https://s3.vn-hcm-1.vietnix.cloud/cuontruyen/imports' }),
    'https://s3.vn-hcm-1.vietnix.cloud'
  );
  assert.equal(
    publicImportsOrigin({ NEXT_PUBLIC_IMPORTS_BASE_URL: 'https://img.example.com/comics/' }),
    'https://img.example.com'
  );
});

test('publicImportsOrigin falls back to the Vietnix S3 origin for production covers', async () => {
  const { publicImportsOrigin } = await import('../src/lib/shared/resource-hints.mjs');

  assert.equal(publicImportsOrigin({}), 'https://s3.vn-hcm-1.vietnix.cloud');
  assert.equal(publicImportsOrigin({ PUBLIC_IMPORTS_BASE_URL: 'not a url' }), 'https://s3.vn-hcm-1.vietnix.cloud');
});

test('root app layout emits S3 resource hints before public image requests', () => {
  const source = fs.readFileSync('src/app/layout.tsx', 'utf8');

  assert.match(source, /publicImportsOrigin/);
  assert.match(source, /const importsOrigin = publicImportsOrigin\(\)/);
  assert.match(source, /<head>/);
  assert.match(source, /rel="preconnect"/);
  assert.match(source, /rel="dns-prefetch"/);
  assert.match(source, /href=\{importsOrigin\}/);
  assert.match(source, /crossOrigin=""/);
});
