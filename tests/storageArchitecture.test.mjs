import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('postgres catalog storage does not depend on the JSON catalog store', () => {
  const source = fs.readFileSync(new URL('../server/postgresStore.mjs', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /from ['"]\.\/catalogStore\.mjs['"]/);
  assert.match(source, /from ['"]\.\/catalogMerge\.mjs['"]/);
});
