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

export function mergeSeries(existing, incoming) {
  if (!existing) return incoming;
  const incomingChapterIds = new Set(incoming.chapters.map((chapter) => chapter.id));
  const existingOnlyChapters = existing.chapters.filter((chapter) => !incomingChapterIds.has(chapter.id));
  const mergedIncomingChapters = incoming.chapters.map((chapter) => {
    const previous = existing.chapters.find((item) => item.id === chapter.id);
    if (chapter.imported || !previous?.imported) return chapter;
    return previous;
  });

  return {
    ...existing,
    ...incoming,
    importedAt: existing.importedAt || incoming.importedAt,
    chapters: [...mergedIncomingChapters, ...existingOnlyChapters]
      .sort((a, b) => Number(a.sourceOrder ?? 0) - Number(b.sourceOrder ?? 0))
  };
}

export async function upsertSeries(series) {
  const catalog = await readCatalog();
  const index = catalog.series.findIndex((item) => item.id === series.id);
  const existing = index >= 0 ? catalog.series[index] : null;
  const merged = mergeSeries(existing, series);
  const nextSeries = {
    ...merged,
    importedAt: merged.importedAt || new Date().toISOString(),
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
