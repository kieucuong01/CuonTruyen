import '../server/env.mjs';

import { ensureStorageSchema } from '../server/dataStore.mjs';
import { closePostgresPool } from '../server/postgresStore.mjs';
import { assertCatalogStorageReady, catalogStorageSummary } from '../server/storageConfig.mjs';

assertCatalogStorageReady();
await ensureStorageSchema();
console.log(JSON.stringify({
  ok: true,
  storage: catalogStorageSummary()
}, null, 2));
await closePostgresPool();
