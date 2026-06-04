import path from 'node:path';

import { main as exportStaticApi } from './export-static-api.mjs';

const ROOT = process.cwd();

process.env.STATIC_API_OUTPUT_DIR = path.join(ROOT, 'public', 'static-api');

await exportStaticApi();
await import('./write-public-config.mjs');
