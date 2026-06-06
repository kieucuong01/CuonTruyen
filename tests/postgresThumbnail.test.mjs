import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { POSTGRES_SCHEMA_SQL } from '../server/postgresStore.mjs';

const POSTGRES_STORE_SOURCE = fs.readFileSync(new URL('../server/postgresStore.mjs', import.meta.url), 'utf8');

test('postgres schema stores series thumbnail metadata', () => {
  assert.match(POSTGRES_SCHEMA_SQL, /\bthumbnail_url text\b/);
  assert.match(POSTGRES_SCHEMA_SQL, /\bcover_thumbnail jsonb\b/);
});

test('postgres row mapping preserves series thumbnail metadata', () => {
  assert.match(POSTGRES_STORE_SOURCE, /thumbnailUrl:\s*row\.thumbnail_url/);
  assert.match(POSTGRES_STORE_SOURCE, /coverThumbnail:\s*row\.cover_thumbnail/);
  assert.match(POSTGRES_STORE_SOURCE, /series\.thumbnailUrl/);
  assert.match(POSTGRES_STORE_SOURCE, /json\(series\.coverThumbnail\)/);
});
