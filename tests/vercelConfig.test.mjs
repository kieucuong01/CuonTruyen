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
    true
  );
});

test('vercel serverless API catch-all exists for admin production', () => {
  assert.equal(fs.existsSync('api/[...path].mjs'), true);
  const source = fs.readFileSync('api/[...path].mjs', 'utf8');
  assert.match(source, /handleNodeRequest/);
});
