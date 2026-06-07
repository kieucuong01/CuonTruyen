import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('vercel config lets live API routes reach serverless functions', () => {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const rewrites = config.rewrites || [];

  assert.equal(
    rewrites.some((rewrite) => String(rewrite.source || '').startsWith('/api/')),
    false
  );
  assert.equal(
    rewrites.some((rewrite) => String(rewrite.source || '').startsWith('/static-api/')),
    false
  );
});

test('vercel serverless API catch-all exists for admin production', () => {
  assert.equal(fs.existsSync('api/[...path].mjs'), true);
  const source = fs.readFileSync('api/[...path].mjs', 'utf8');
  assert.match(source, /handleNodeRequest/);
});

test('vercel exposes nested public series API routes', () => {
  assert.equal(fs.existsSync('api/series/[...path].js'), true);
  const source = fs.readFileSync('api/series/[...path].js', 'utf8');
  assert.match(source, /handleNodeRequest/);

  for (const conflictingFile of [
    'api/series/[id].js',
    'api/series/[series]/chapters/[chapter].js',
    'api/series/[series]/chapters/[chapter]/next.js'
  ]) {
    assert.equal(fs.existsSync(conflictingFile), false, `${conflictingFile} conflicts with api/series/[...path].js`);
  }
});

test('vercel production blocks local-only publish pipeline API', () => {
  const source = fs.readFileSync('server/index.mjs', 'utf8');

  assert.match(source, /function localAdminOperationsEnabled\(\)/);
  assert.match(source, /ENABLE_LOCAL_CRAWLER_UI/);
  assert.match(source, /publish-production/);
  assert.match(source, /Production pipeline/);
  assert.match(source, /admin local\/crawler/);
});

test('vercel build and public config honor DB-first catalog mode', () => {
  const buildSource = fs.readFileSync('scripts/build-vercel.mjs', 'utf8');
  const configSource = fs.readFileSync('scripts/write-public-config.mjs', 'utf8');

  assert.match(buildSource, /requirePostgresCatalogUrl/);
  assert.doesNotMatch(buildSource, /exportStaticApi|VERCEL_EXPORT_STATIC_API|STATIC_API_OUTPUT_DIR/);
  assert.doesNotMatch(configSource, /staticApiMode|staticApiBaseUrl|FORCE_STATIC_API_MODE|STATIC_API_BASE_URL/);
});
