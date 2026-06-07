import assert from 'node:assert/strict';
import test from 'node:test';

import {
  catalogStorageMode,
  hasPostgresCatalogUrl,
  postgresCatalogUrl,
  requirePostgresCatalogUrl
} from '../server/storageConfig.mjs';

test('catalog storage selects postgres when a Postgres URL is configured', () => {
  assert.equal(catalogStorageMode({ DATABASE_URL: 'postgres://db.example/catalog' }), 'postgres');
  assert.equal(catalogStorageMode({ POSTGRES_URL: 'postgres://db.example/catalog' }), 'postgres');
  assert.equal(catalogStorageMode({ CATALOG_DATABASE_URL: 'postgres://db.example/catalog' }), 'postgres');
  assert.equal(hasPostgresCatalogUrl({ CATALOG_DATABASE_URL: 'postgres://db.example/catalog' }), true);
});

test('catalog storage supports an explicit json escape hatch', () => {
  assert.equal(catalogStorageMode({
    CATALOG_STORAGE: 'json',
    DATABASE_URL: 'postgres://db.example/catalog'
  }), 'json');
});

test('explicit postgres catalog mode requires a connection URL', () => {
  const env = { CATALOG_STORAGE: 'postgres' };

  assert.equal(catalogStorageMode(env), 'postgres');
  assert.equal(postgresCatalogUrl(env), '');
  assert.throws(
    () => requirePostgresCatalogUrl(env),
    /CATALOG_STORAGE=postgres requires CATALOG_DATABASE_URL, DATABASE_URL, or POSTGRES_URL/
  );
});
