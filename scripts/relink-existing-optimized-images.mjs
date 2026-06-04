import fs from 'node:fs/promises';
import path from 'node:path';

import { IMPORT_ROOT, publicImportPath } from '../server/catalogStore.mjs';
import { readCatalog, writeCatalog } from '../server/dataStore.mjs';
import {
  estimateOptimizationSaving,
  imageOptimizationConfig,
  optimizedFilenameFor
} from '../server/imageOptimizer.mjs';

const SOURCE_RE = /\.(jpe?g|png)$/i;

async function main() {
  const config = imageOptimizationConfig(process.env);
  const root = path.resolve(process.argv.includes('--root')
    ? process.argv[process.argv.indexOf('--root') + 1]
    : IMPORT_ROOT);
  const apply = process.argv.includes('--apply');
  const cleanup = process.argv.includes('--cleanup-originals');
  const seriesId = argValue('--series-id', '');
  const catalog = await readCatalog({ includePages: true, includeDraft: true });
  const updates = [];

  for (const series of matchingSeries(catalog, seriesId)) {
    for (const chapter of series.chapters || []) {
      for (const page of chapter.pages || []) {
        const currentPath = importFileFromValue(root, page.src || page.imageUrl || page.storageKey || '');
        if (!currentPath || !SOURCE_RE.test(currentPath)) continue;
        const optimizedPath = path.join(path.dirname(currentPath), optimizedFilenameFor(path.basename(currentPath), config));
        const [originalStat, optimizedStat] = await Promise.all([
          statFile(currentPath),
          statFile(optimizedPath)
        ]);
        if (!originalStat || !optimizedStat) continue;
        const savePercent = estimateOptimizationSaving({
          originalBytes: originalStat.size,
          optimizedBytes: optimizedStat.size
        });
        if (savePercent < Number(config.minSavingPercent || 0)) continue;
        const optimizedPublicPath = publicPathFromImportFile(root, optimizedPath);
        updates.push({
          page,
          originalPath: path.resolve(currentPath),
          optimizedPath: path.resolve(optimizedPath),
          originalPublicPath: publicPathFromImportFile(root, currentPath),
          optimizedPublicPath,
          originalBytes: originalStat.size,
          optimizedBytes: optimizedStat.size,
          savePercent
        });
      }
    }
  }

  if (apply) {
    for (const update of updates) {
      update.page.originalImageUrl = update.page.originalImageUrl || update.originalPublicPath;
      update.page.originalBytes = update.page.originalBytes || update.originalBytes;
      update.page.src = update.optimizedPublicPath;
      update.page.imageUrl = update.optimizedPublicPath;
      update.page.storageKey = update.optimizedPublicPath;
      update.page.storedBytes = update.optimizedBytes;
      update.page.optimized = true;
    }
    await writeCatalog(catalog);
  }

  const cleanupResult = cleanup && apply
    ? await cleanupOriginals(root, updates, catalog)
    : { deletedOriginalFiles: 0, deletedOriginalBytes: 0, cleanupSkippedReferenced: 0, cleanupSkippedMissing: 0 };

  const originalBytes = updates.reduce((sum, update) => sum + update.originalBytes, 0);
  const optimizedBytes = updates.reduce((sum, update) => sum + update.optimizedBytes, 0);
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    root,
    relinkedPages: updates.length,
    relinkOriginalBytes: originalBytes,
    relinkOptimizedBytes: optimizedBytes,
    relinkWouldSaveBytes: Math.max(0, originalBytes - optimizedBytes),
    relinkSavingPercent: estimateOptimizationSaving({ originalBytes, optimizedBytes }),
    ...cleanupResult
  }, null, 2));
}

function matchingSeries(catalog, seriesId = '') {
  const target = String(seriesId || '').trim();
  const series = Array.isArray(catalog.series) ? catalog.series : [];
  if (!target) return series;
  return series.filter((item) => item.id === target || item.slug === target);
}

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

async function cleanupOriginals(root, updates, catalog) {
  const activeRefs = activeCatalogImportReferences(root, catalog);
  const originals = new Map();
  for (const update of updates) originals.set(update.originalPath, update);
  const result = {
    deletedOriginalFiles: 0,
    deletedOriginalBytes: 0,
    cleanupSkippedReferenced: 0,
    cleanupSkippedMissing: 0
  };
  for (const update of originals.values()) {
    if (activeRefs.has(update.originalPath)) {
      result.cleanupSkippedReferenced += 1;
      continue;
    }
    const stat = await statFile(update.originalPath);
    if (!stat) {
      result.cleanupSkippedMissing += 1;
      continue;
    }
    await fs.rm(update.originalPath, { force: true });
    result.deletedOriginalFiles += 1;
    result.deletedOriginalBytes += stat.size;
  }
  return result;
}

function activeCatalogImportReferences(root, catalog) {
  const refs = new Set();
  for (const series of catalog.series || []) {
    for (const chapter of series.chapters || []) {
      for (const page of chapter.pages || []) {
        for (const value of [page.src, page.imageUrl, page.storageKey]) {
          const filePath = importFileFromValue(root, value);
          if (filePath) refs.add(path.resolve(filePath));
        }
      }
    }
  }
  return refs;
}

function importFileFromValue(root, value = '') {
  const importPath = extractImportPath(String(value || '').trim());
  if (!importPath) return '';
  const parts = importPath.replace(/^\/imports\//, '').split('/').map((part) => decodeURIComponent(part));
  if (parts.length < 3) return '';
  return path.join(root, ...parts);
}

function extractImportPath(value = '') {
  if (value.startsWith('/imports/')) return value;
  try {
    const parsed = new URL(value);
    const marker = '/imports/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex >= 0) return decodeURI(parsed.pathname.slice(markerIndex));
  } catch {}
  return '';
}

function publicPathFromImportFile(root, filePath) {
  const relative = path.relative(root, filePath).split(path.sep).map(encodeURIComponent).join('/');
  const [seriesId, chapterId, ...rest] = relative.split('/');
  return publicImportPath(decodeURIComponent(seriesId), decodeURIComponent(chapterId), decodeURIComponent(rest.join('/')));
}

async function statFile(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() ? stat : null;
  } catch {
    return null;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
