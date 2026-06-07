import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertCatalogStorageReady,
  catalogStorageSummary,
  catalogStorageMode,
  hasPostgresCatalogUrl,
  postgresCatalogUrl,
  productionPostgresCatalogUrl,
  requirePostgresCatalogUrl
} from '../server/storageConfig.mjs';

test('catalog storage is always postgres', () => {
  assert.equal(catalogStorageMode({}), 'postgres');
  assert.equal(catalogStorageMode({ DATABASE_URL: 'postgres://db.example/catalog' }), 'postgres');
  assert.equal(catalogStorageMode({ POSTGRES_URL: 'postgres://db.example/catalog' }), 'postgres');
  assert.equal(catalogStorageMode({ CATALOG_DATABASE_URL: 'postgres://db.example/catalog' }), 'postgres');
  assert.equal(catalogStorageMode({ CATALOG_STORAGE: 'file', DATABASE_URL: 'postgres://db.example/catalog' }), 'postgres');
  assert.equal(hasPostgresCatalogUrl({ CATALOG_DATABASE_URL: 'postgres://db.example/catalog' }), true);
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

test('postgres catalog readiness fails before runtime starts without a database', () => {
  assert.throws(
    () => assertCatalogStorageReady({}),
    /PostgreSQL catalog mode requires CATALOG_DATABASE_URL, DATABASE_URL, or POSTGRES_URL/
  );
});

test('file catalog env still requires a Postgres URL', () => {
  assert.throws(
    () => assertCatalogStorageReady({ CATALOG_STORAGE: 'file' }),
    /PostgreSQL catalog mode requires CATALOG_DATABASE_URL, DATABASE_URL, or POSTGRES_URL/
  );
});

test('catalog storage summary includes masked production target and source relation', () => {
  const env = {
    CATALOG_STORAGE: 'postgres',
    CATALOG_DATABASE_URL: 'postgres://local_user:local_secret@localhost:5432/local_catalog',
    PRODUCTION_CATALOG_DATABASE_URL: 'postgres://prod_user:prod_secret@db.example.com:6543/postgres'
  };
  const summary = catalogStorageSummary(env);

  assert.equal(productionPostgresCatalogUrl(env), env.PRODUCTION_CATALOG_DATABASE_URL);
  assert.equal(summary.postgres.displayUrl.includes('local_secret'), false);
  assert.equal(summary.productionPostgres.displayUrl.includes('prod_secret'), false);
  assert.equal(summary.productionPostgres.configured, true);
  assert.equal(summary.productionPostgres.sameAsSource, false);

  const sameSummary = catalogStorageSummary({
    ...env,
    PRODUCTION_CATALOG_DATABASE_URL: env.CATALOG_DATABASE_URL
  });
  assert.equal(sameSummary.productionPostgres.sameAsSource, true);
});
