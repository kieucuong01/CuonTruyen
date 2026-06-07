const POSTGRES_STORAGE_VALUES = new Set(['postgres', 'postgresql', 'db', 'database']);

export function postgresCatalogUrl(env = process.env) {
  return String(env.CATALOG_DATABASE_URL || env.DATABASE_URL || env.POSTGRES_URL || '').trim();
}

export function productionPostgresCatalogUrl(env = process.env) {
  return String(env.PRODUCTION_CATALOG_DATABASE_URL || env.PRODUCTION_DATABASE_URL || '').trim();
}

export function postgresCatalogUrlSource(env = process.env) {
  if (String(env.CATALOG_DATABASE_URL || '').trim()) return 'CATALOG_DATABASE_URL';
  if (String(env.DATABASE_URL || '').trim()) return 'DATABASE_URL';
  if (String(env.POSTGRES_URL || '').trim()) return 'POSTGRES_URL';
  return '';
}

export function productionPostgresCatalogUrlSource(env = process.env) {
  if (String(env.PRODUCTION_CATALOG_DATABASE_URL || '').trim()) return 'PRODUCTION_CATALOG_DATABASE_URL';
  if (String(env.PRODUCTION_DATABASE_URL || '').trim()) return 'PRODUCTION_DATABASE_URL';
  return '';
}

export function hasPostgresCatalogUrl(env = process.env) {
  return Boolean(postgresCatalogUrl(env));
}

export function catalogStorageMode(env = process.env) {
  const explicit = String(env.CATALOG_STORAGE || env.CATALOG_STORAGE_MODE || '').trim().toLowerCase();
  if (POSTGRES_STORAGE_VALUES.has(explicit)) return 'postgres';
  return 'postgres';
}

export function requirePostgresCatalogUrl(env = process.env) {
  const url = postgresCatalogUrl(env);
  if (url) return url;
  throw new Error('PostgreSQL catalog mode requires CATALOG_DATABASE_URL, DATABASE_URL, or POSTGRES_URL. Run npm run db:local:setup for the local database.');
}

export function assertCatalogStorageReady(env = process.env) {
  requirePostgresCatalogUrl(env);
  return 'postgres';
}

export function maskPostgresCatalogUrl(value = '') {
  const url = String(value || '').trim();
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    if (parsed.username) parsed.username = parsed.username ? `${parsed.username}` : '';
    return parsed.toString();
  } catch {
    return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
  }
}

export function catalogStorageSummary(env = process.env) {
  const mode = catalogStorageMode(env);
  const url = postgresCatalogUrl(env);
  const productionUrl = productionPostgresCatalogUrl(env);
  const summary = {
    mode,
    env: String(env.CATALOG_STORAGE || env.CATALOG_STORAGE_MODE || '').trim() || 'default',
    postgres: {
      configured: Boolean(url),
      source: postgresCatalogUrlSource(env),
      displayUrl: maskPostgresCatalogUrl(url),
      host: '',
      database: '',
      user: '',
      sslRejectUnauthorized: String(env.POSTGRES_SSL_REJECT_UNAUTHORIZED || '').trim() || ''
    },
    productionPostgres: {
      configured: Boolean(productionUrl),
      source: productionPostgresCatalogUrlSource(env),
      displayUrl: maskPostgresCatalogUrl(productionUrl),
      host: '',
      database: '',
      user: '',
      sameAsSource: Boolean(url && productionUrl && url === productionUrl)
    }
  };
  if (url) {
    try {
      const parsed = new URL(url);
      summary.postgres.host = parsed.host;
      summary.postgres.database = parsed.pathname.replace(/^\//, '');
      summary.postgres.user = decodeURIComponent(parsed.username || '');
    } catch {}
  }
  if (productionUrl) {
    try {
      const parsed = new URL(productionUrl);
      summary.productionPostgres.host = parsed.host;
      summary.productionPostgres.database = parsed.pathname.replace(/^\//, '');
      summary.productionPostgres.user = decodeURIComponent(parsed.username || '');
    } catch {}
  }
  return summary;
}
