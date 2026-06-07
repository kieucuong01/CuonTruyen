const POSTGRES_STORAGE_VALUES = new Set(['postgres', 'postgresql', 'db', 'database']);
const JSON_STORAGE_VALUES = new Set(['json', 'local', 'file']);

export function postgresCatalogUrl(env = process.env) {
  return String(env.CATALOG_DATABASE_URL || env.DATABASE_URL || env.POSTGRES_URL || '').trim();
}

export function hasPostgresCatalogUrl(env = process.env) {
  return Boolean(postgresCatalogUrl(env));
}

export function catalogStorageMode(env = process.env) {
  const explicit = String(env.CATALOG_STORAGE || env.CATALOG_STORAGE_MODE || '').trim().toLowerCase();
  if (POSTGRES_STORAGE_VALUES.has(explicit)) return 'postgres';
  if (JSON_STORAGE_VALUES.has(explicit)) return 'json';
  return hasPostgresCatalogUrl(env) ? 'postgres' : 'json';
}

export function requirePostgresCatalogUrl(env = process.env) {
  const url = postgresCatalogUrl(env);
  if (url) return url;
  throw new Error('CATALOG_STORAGE=postgres requires CATALOG_DATABASE_URL, DATABASE_URL, or POSTGRES_URL.');
}
