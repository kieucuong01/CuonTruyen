import fs from 'node:fs/promises';
import path from 'node:path';
export { publicImportPath, publicImportUrl } from './publicImportUrl.mjs';

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
