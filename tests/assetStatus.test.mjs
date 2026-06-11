import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('postgres schema stores import mode and asset status fields', () => {
  const source = fs.readFileSync(new URL('../server/postgresStore.mjs', import.meta.url), 'utf8');

  assert.match(source, /import_mode text not null default 'image_url'/);
  assert.match(source, /asset_status text not null default 'external'/);
  assert.match(source, /image_error_count integer not null default 0/);
  assert.match(source, /last_asset_check_at timestamptz/);
  assert.match(source, /asset_status = excluded\.asset_status/);
  assert.match(source, /POSTGRES_SCHEMA_BACKFILL_SQL/);
  assert.match(source, /POSTGRES_RUN_SCHEMA_BACKFILL === 'true'/);
});
