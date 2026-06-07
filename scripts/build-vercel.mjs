import path from 'node:path';

import { main as exportStaticApi } from './export-static-api.mjs';
import { catalogStorageMode, requirePostgresCatalogUrl } from '../server/storageConfig.mjs';

const ROOT = process.cwd();
const isVercelBuild = process.env.VERCEL === '1';
const forceCatalogExport = process.env.VERCEL_EXPORT_STATIC_API === 'true';
const storageMode = catalogStorageMode(process.env);

if (isVercelBuild && storageMode === 'postgres') {
  requirePostgresCatalogUrl(process.env);
}

if (!isVercelBuild || forceCatalogExport) {
  process.env.STATIC_API_OUTPUT_DIR = path.join(ROOT, 'public', 'static-api');
  await exportStaticApi();
} else {
  console.log('[vercel-build] skipped catalog export on Vercel; using packaged static API and configured STATIC_API_BASE_URL');
}

await import('./write-public-config.mjs');
