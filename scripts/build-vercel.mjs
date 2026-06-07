import { requirePostgresCatalogUrl } from '../server/storageConfig.mjs';

const isVercelBuild = process.env.VERCEL === '1';

if (isVercelBuild) {
  requirePostgresCatalogUrl(process.env);
}

await import('./write-public-config.mjs');
