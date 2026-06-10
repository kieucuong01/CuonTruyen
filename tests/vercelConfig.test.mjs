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
  assert.equal(fs.existsSync('api/admin/[...path].mjs'), true);
  const source = fs.readFileSync('api/[...path].mjs', 'utf8');
  const adminSource = fs.readFileSync('api/admin/[...path].mjs', 'utf8');
  assert.match(source, /handleNodeRequest/);
  assert.match(adminSource, /handleNodeRequest/);

  const apiFiles = listApiFunctionFiles('api');
  assert.deepEqual(apiFiles.sort(), ['[...path].mjs', 'admin/[...path].mjs'].sort());
});

test('vercel avoids duplicate public API functions on Hobby deployments', () => {
  for (const conflictingFile of [
    'api/reader.js',
    'api/series.js',
    'api/admin/[...path].js',
    'api/series/[...path].js',
    'api/series/[id].js',
    'api/series/[series]/chapters/[chapter].js',
    'api/series/[series]/chapters/[chapter]/next.js'
  ]) {
    assert.equal(fs.existsSync(conflictingFile), false, `${conflictingFile} conflicts with flat api/series.js`);
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
  assert.match(configSource, /writePublicSnapshotApi/);
  assert.match(configSource, /postgres-build-snapshot/);
  assert.match(configSource, /function snapshotBaseUrl\(\)/);
  assert.match(configSource, /process\.env\.VERCEL === '1'\) return '\/static-api'/);
  assert.doesNotMatch(buildSource, /VERCEL_EXPORT_STATIC_API|STATIC_API_OUTPUT_DIR/);
  assert.doesNotMatch(configSource, /staticApiMode|FORCE_STATIC_API_MODE/);
});

function listApiFunctionFiles(root, prefix = '') {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = `${root}/${entry.name}`;
    if (entry.isDirectory()) return listApiFunctionFiles(fullPath, relativePath);
    return /\.(mjs|js)$/.test(entry.name) ? [relativePath] : [];
  });
}
