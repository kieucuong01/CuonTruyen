import { requirePostgresCatalogUrl } from '../server/storageConfig.mjs';
import { closePostgresPool } from '../server/postgresStore.mjs';

const isVercelBuild = process.env.VERCEL === '1';

if (isVercelBuild) {
  requirePostgresCatalogUrl(process.env);
}

try {
  await import('./write-public-config.mjs');
} finally {
  await closePostgresPool();
}
