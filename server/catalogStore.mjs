import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
export const IMPORT_ROOT = path.resolve(process.env.IMPORT_ROOT || path.join(ROOT, 'data', 'imports'));

export async function seriesDir(seriesId) {
  const dir = path.join(IMPORT_ROOT, seriesId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function chapterDir(seriesId, chapterId) {
  const dir = path.join(await seriesDir(seriesId), chapterId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function publicImportsBaseUrl() {
  if (process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED === 'false') return '';
  const shouldUsePublicBase = process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED === 'true'
    || Boolean(process.env.VERCEL)
    || process.env.NODE_ENV === 'production';
  if (!shouldUsePublicBase) return '';
  return (
    process.env.PUBLIC_IMPORTS_BASE_URL
    || process.env.S3_PUBLIC_BASE_URL
    || process.env.VIETNIX_S3_PUBLIC_BASE_URL
    || ''
  ).replace(/\/$/, '');
}

export function publicImportUrl(value = '') {
  const url = String(value || '');
  const importPath = toPublicImportPath(url);
  if (!importPath) return url;
  const baseUrl = publicImportsBaseUrl();
  return baseUrl ? `${baseUrl}${importPath}` : importPath;
}

export function publicImportPath(seriesId, chapterId, filename) {
  return publicImportUrl(`/imports/${encodeURIComponent(seriesId)}/${encodeURIComponent(chapterId)}/${encodeURIComponent(filename)}`);
}

function toPublicImportPath(value = '') {
  if (!value) return '';
  if (value.startsWith('/imports/')) return value;
  try {
    const parsed = new URL(value);
    const marker = '/imports/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex >= 0) return decodeURI(parsed.pathname.slice(markerIndex));
  } catch {
    return '';
  }
  return '';
}
