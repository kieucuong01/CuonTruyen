import {
  ensurePostgresSchema,
  getSeriesFromPostgres,
  readCatalogFromPostgres,
  upsertSeriesInPostgres,
  usesPostgresStorage,
  writeCatalogToPostgres
} from './postgresStore.mjs';

export { usesPostgresStorage };

export async function ensureStorageSchema() {
  return ensurePostgresSchema();
}

export async function readCatalog(options = {}) {
  return readCatalogFromPostgres(options);
}

export async function writeCatalog(catalog) {
  return writeCatalogToPostgres(catalog);
}

export async function upsertSeries(series) {
  return upsertSeriesInPostgres(series);
}

export async function getSeries(idOrSlug, options = {}) {
  return getSeriesFromPostgres(idOrSlug, options);
}
