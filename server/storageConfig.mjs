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
  return 'postgres';
}

export function requirePostgresCatalogUrl(env = process.env) {
  const url = postgresCatalogUrl(env);
  if (url) return url;
  throw new Error('PostgreSQL catalog mode requires CATALOG_DATABASE_URL, DATABASE_URL, or POSTGRES_URL. Run npm run db:local:setup for the local database, or set CATALOG_STORAGE=json for the legacy JSON fallback.');
}

export function assertCatalogStorageReady(env = process.env) {
  const mode = catalogStorageMode(env);
  if (mode === 'postgres') requirePostgresCatalogUrl(env);
  return mode;
}
