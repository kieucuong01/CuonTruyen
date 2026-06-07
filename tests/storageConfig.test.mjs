import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertCatalogStorageReady,
  catalogStorageMode,
  hasPostgresCatalogUrl,
  postgresCatalogUrl,
  requirePostgresCatalogUrl
} from '../server/storageConfig.mjs';

test('catalog storage defaults to postgres without an explicit json escape hatch', () => {
  assert.equal(catalogStorageMode({}), 'postgres');
});

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
    /PostgreSQL catalog mode requires CATALOG_DATABASE_URL, DATABASE_URL, or POSTGRES_URL/
  );
});

test('postgres catalog readiness fails before runtime can fall back to json', () => {
  assert.throws(
    () => assertCatalogStorageReady({}),
    /PostgreSQL catalog mode requires CATALOG_DATABASE_URL, DATABASE_URL, or POSTGRES_URL/
  );
});

test('explicit json catalog readiness bypasses the postgres URL requirement', () => {
  assert.equal(assertCatalogStorageReady({ CATALOG_STORAGE: 'json' }), 'json');
});
