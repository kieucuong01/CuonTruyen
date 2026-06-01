import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
export const IMPORT_ROOT = path.resolve(process.env.IMPORT_ROOT || path.join(ROOT, 'data', 'imports'));
const CATALOG_PATH = path.join(IMPORT_ROOT, 'catalog.json');
let catalogCache = null;
let writeQueue = Promise.resolve();

async function ensureRoot() {
  await fs.mkdir(IMPORT_ROOT, { recursive: true });
}

export async function readCatalog() {
  await ensureRoot();
  try {
    const stat = await fs.stat(CATALOG_PATH);
    if (
      catalogCache
      && catalogCache.mtimeMs === stat.mtimeMs
      && catalogCache.size === stat.size
    ) {
      return catalogCache.value;
    }
    let value;
    try {
      value = JSON.parse(await fs.readFile(CATALOG_PATH, 'utf8'));
    } catch (error) {
      if (error instanceof SyntaxError && catalogCache?.value) return catalogCache.value;
      throw error;
    }
    catalogCache = {
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      value
    };
    return value;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { series: [] };
  }
}

export function writeCatalog(catalog) {
  const pendingWrite = writeQueue.then(() => writeCatalogNow(catalog));
  writeQueue = pendingWrite.catch(() => {});
  return pendingWrite;
}

async function writeCatalogNow(catalog) {
  await ensureRoot();
  const tempPath = path.join(
    IMPORT_ROOT,
    `.catalog.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  );
  await fs.writeFile(tempPath, `${JSON.stringify(catalog, null, 2)}\n`);
  try {
    await renameWithRetry(tempPath, CATALOG_PATH);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
  const stat = await fs.stat(CATALOG_PATH);
  catalogCache = {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    value: catalog
  };
}

async function renameWithRetry(from, to) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === 7) throw error;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
}

export function mergeSeries(existing, incoming) {
  if (!existing) return incoming;
  const incomingChapterIds = new Set(incoming.chapters.map((chapter) => chapter.id));
  const existingOnlyChapters = existing.chapters.filter((chapter) => !incomingChapterIds.has(chapter.id));
  const mergedIncomingChapters = incoming.chapters.map((chapter) => {
    const previous = existing.chapters.find((item) => item.id === chapter.id);
    const previousWasPublic = previous?.status === 'public' || (!previous?.status && (previous?.imported || previous?.pages?.length));
    const next = chapter.imported || !previous?.imported ? chapter : previous;
    return {
      ...next,
      status: previousWasPublic ? 'public' : (previous?.status || next.status)
    };
  });
  const existingWasPublic = existing.status === 'public' || (!existing.status && existing.chapters?.some((chapter) => chapter.imported || chapter.pages?.length));

  return {
    ...existing,
    ...incoming,
    status: existingWasPublic ? 'public' : (incoming.status || existing.status),
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

function publicImportsBaseUrl() {
  return (process.env.PUBLIC_IMPORTS_BASE_URL || '').replace(/\/$/, '');
}

export function publicImportUrl(value = '') {
  const url = String(value || '');
  if (!url || !url.startsWith('/imports/')) return url;
  const baseUrl = publicImportsBaseUrl();
  return baseUrl ? `${baseUrl}${url}` : url;
}

export function publicImportPath(seriesId, chapterId, filename) {
  return publicImportUrl(`/imports/${encodeURIComponent(seriesId)}/${encodeURIComponent(chapterId)}/${encodeURIComponent(filename)}`);
}
