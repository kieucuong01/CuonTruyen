import { requirePostgresCatalogUrl } from '../server/storageConfig.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const isVercelBuild = process.env.VERCEL === '1';

if (isVercelBuild) {
  requirePostgresCatalogUrl(process.env);
}

process.env.SKIP_STATIC_SEO_EXPORT = 'true';
await import('./write-public-config.mjs');

await new Promise((resolve, reject) => {
  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextBin, 'build'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
  });
  child.on('error', reject);
  child.on('exit', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`next build exited with code ${code}`));
  });
});
