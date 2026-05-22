import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
export const IMPORT_ROOT = path.join(ROOT, 'data', 'imports');
const CATALOG_PATH = path.join(IMPORT_ROOT, 'catalog.json');

async function ensureRoot() {
  await fs.mkdir(IMPORT_ROOT, { recursive: true });
}

export async function readCatalog() {
  await ensureRoot();
  try {
    return JSON.parse(await fs.readFile(CATALOG_PATH, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { series: [] };
  }
}

export async function writeCatalog(catalog) {
  await ensureRoot();
  await fs.writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
}

export async function upsertSeries(series) {
  const catalog = await readCatalog();
  const index = catalog.series.findIndex((item) => item.id === series.id);
  const nextSeries = {
    ...series,
    importedAt: series.importedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (index >= 0) catalog.series[index] = nextSeries;
  else catalog.series.unshift(nextSeries);
  await writeCatalog(catalog);
  return nextSeries;
}

export async function getSeries(id) {
  const catalog = await readCatalog();
  return catalog.series.find((series) => series.id === id) || null;
}

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

export function publicImportPath(seriesId, chapterId, filename) {
  return `/imports/${encodeURIComponent(seriesId)}/${encodeURIComponent(chapterId)}/${encodeURIComponent(filename)}`;
}
