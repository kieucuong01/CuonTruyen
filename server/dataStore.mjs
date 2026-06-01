import {
  getSeries as getJsonSeries,
  readCatalog as readJsonCatalog,
  upsertSeries as upsertJsonSeries,
  writeCatalog as writeJsonCatalog
} from './catalogStore.mjs';
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
  if (!usesPostgresStorage()) return false;
  return ensurePostgresSchema();
}

export async function readCatalog(options = {}) {
  if (usesPostgresStorage()) return readCatalogFromPostgres(options);
  return readJsonCatalog();
}

export async function writeCatalog(catalog) {
  if (usesPostgresStorage()) return writeCatalogToPostgres(catalog);
  return writeJsonCatalog(catalog);
}

export async function upsertSeries(series) {
  if (usesPostgresStorage()) return upsertSeriesInPostgres(series);
  return upsertJsonSeries(series);
}

export async function getSeries(idOrSlug, options = {}) {
  if (usesPostgresStorage()) return getSeriesFromPostgres(idOrSlug, options);
  return getJsonSeries(idOrSlug);
}
