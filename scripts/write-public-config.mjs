import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const CONFIG_PATH = path.join(PUBLIC_DIR, 'config.js');

function trimTrailingSlash(value = '') {
  return String(value || '').trim().replace(/\/$/, '');
}

function serializeConfig(config) {
  return `window.COMIC_READER_CONFIG = {
  ...(window.COMIC_READER_CONFIG || {}),
  ${Object.entries(config)
    .map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`)
    .join(',\n  ')}
};\n`;
}

const config = {
  apiBaseUrl: trimTrailingSlash(process.env.API_BASE_URL || process.env.PUBLIC_API_BASE_URL || ''),
  staticApiMode: String(process.env.STATIC_API_MODE || '').toLowerCase() === 'true',
  staticApiBaseUrl: trimTrailingSlash(process.env.STATIC_API_BASE_URL || process.env.PUBLIC_STATIC_API_BASE_URL || '')
};

await fs.mkdir(PUBLIC_DIR, { recursive: true });
await fs.writeFile(CONFIG_PATH, serializeConfig(config), 'utf8');
console.log(`[vercel-config] wrote public/config.js with apiBaseUrl=${config.apiBaseUrl || '(same-origin)'}`);
