import fs from 'node:fs/promises';
import path from 'node:path';

import { IMPORT_ROOT } from '../server/catalogStore.mjs';
import { readCatalog } from '../server/dataStore.mjs';

const IMAGE_RE = /\.(jpe?g|png|webp|gif|avif)$/i;

async function main() {
  const apply = process.argv.includes('--apply');
  const seriesId = argValue('--series-id', '');
  const root = path.resolve(process.argv.includes('--root')
    ? process.argv[process.argv.indexOf('--root') + 1]
    : IMPORT_ROOT);
  const catalog = await readCatalog({ includePages: true, includeDraft: true });
  const activeRefs = activeCatalogImportReferences(root, catalog, seriesId);
  const scanRoot = seriesId ? path.join(root, seriesId) : root;
  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    root,
    activeRefs: activeRefs.size,
    scannedImages: 0,
    unreferencedImages: 0,
    unreferencedBytes: 0,
    deletedImages: 0,
    deletedBytes: 0,
    skippedUnsafe: 0,
    largest: []
  };

  await walk(scanRoot, async (filePath, stat) => {
    if (!IMAGE_RE.test(filePath)) return;
    summary.scannedImages += 1;
    const resolved = path.resolve(filePath);
    if (activeRefs.has(resolved)) return;
    if (!isInsideDirectory(resolved, root)) {
      summary.skippedUnsafe += 1;
      return;
    }
    summary.unreferencedImages += 1;
    summary.unreferencedBytes += stat.size;
    trackLargest(summary.largest, root, resolved, stat.size);
    if (apply) {
      await fs.rm(resolved, { force: true });
      summary.deletedImages += 1;
      summary.deletedBytes += stat.size;
    }
  });

  console.log(JSON.stringify({
    ...summary,
    unreferencedGB: roundGb(summary.unreferencedBytes),
    deletedGB: roundGb(summary.deletedBytes)
  }, null, 2));
}

async function walk(dir, onFile) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(filePath, onFile);
      continue;
    }
    if (!entry.isFile()) continue;
    const stat = await fs.stat(filePath);
    await onFile(filePath, stat);
  }
}

function activeCatalogImportReferences(root, catalog, seriesId = '') {
  const refs = new Set();
  for (const series of matchingSeries(catalog, seriesId)) {
    for (const value of [series.coverUrl, series.thumbnailUrl, series.coverThumbnailUrl]) {
      addActiveRef(refs, root, value);
    }
    for (const chapter of series.chapters || []) {
      for (const page of chapter.pages || []) {
        for (const value of [page.src, page.imageUrl, page.storageKey]) {
          addActiveRef(refs, root, value);
        }
      }
    }
  }
  return refs;
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

function addActiveRef(refs, root, value = '') {
  const filePath = importFileFromValue(root, value);
  if (filePath) refs.add(path.resolve(filePath));
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

function isInsideDirectory(filePath, dir) {
  const resolvedFile = path.resolve(filePath);
  const resolvedDir = path.resolve(dir);
  return resolvedFile === resolvedDir || resolvedFile.startsWith(`${resolvedDir}${path.sep}`);
}

function trackLargest(items, root, filePath, bytes) {
  items.push({
    path: path.relative(root, filePath),
    mb: Math.round((bytes / 1024 / 1024) * 10) / 10
  });
  items.sort((a, b) => b.mb - a.mb);
  items.splice(20);
}

function roundGb(bytes) {
  return Math.round((Number(bytes || 0) / 1024 / 1024 / 1024) * 10000) / 10000;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
