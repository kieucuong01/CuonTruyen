const hasExplicitStorageMode = Boolean(process.env.CATALOG_STORAGE || process.env.CATALOG_STORAGE_MODE);
const hasPostgresUrl = Boolean(
  process.env.CATALOG_DATABASE_URL
  || process.env.DATABASE_URL
  || process.env.POSTGRES_URL
);

if (!hasExplicitStorageMode && !hasPostgresUrl) {
  process.env.CATALOG_STORAGE = 'json';
}
