import fs from 'node:fs/promises';
import path from 'node:path';

import { IMPORT_ROOT, publicImportPath } from '../server/catalogStore.mjs';
import { readCatalog, writeCatalog } from '../server/dataStore.mjs';
import {
  estimateOptimizationSaving,
  imageOptimizationConfig,
  optimizeImageBuffer,
  shouldAttemptImageOptimization
} from '../server/imageOptimizer.mjs';

const IMAGE_RE = /\.(jpe?g|png|webp)$/i;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = imageOptimizationConfig(process.env);
  const root = path.resolve(args.root || IMPORT_ROOT);
  const scanRoot = args.seriesId ? path.join(root, args.seriesId) : root;
  const allImages = await collectImages(scanRoot);
  const catalogImagePaths = args.catalogOnly ? await collectCatalogImageFilePaths(root, args.seriesId) : null;
  const sourceImages = catalogImagePaths ? allImages.filter((item) => catalogImagePaths.has(path.resolve(item.filePath))) : allImages;
  const candidates = sourceImages
    .filter((item) => shouldAttemptImageOptimization({
      filename: item.name,
      byteLength: item.bytes,
      config
    }))
    .sort((a, b) => b.bytes - a.bytes);
  const selected = args.all
    ? candidates
    : candidates.slice(0, Math.max(1, Number(args.limit || 500)));

  const mode = args.apply || process.env.IMAGE_OPTIMIZE_APPLY === 'true' ? 'apply' : 'dry-run';
  const optimizeConcurrency = Math.max(1, Math.min(8, Number(args.concurrency || process.env.IMAGE_OPTIMIZE_CONCURRENCY || 6)));
  let catalog = null;
  const catalogUpdates = new Map();
  if (mode === 'apply') catalog = await readCatalog();
  const summary = {
    mode,
    changedFiles: 0,
    concurrency: optimizeConcurrency,
    catalogPagesUpdated: 0,
    deletedOriginalFiles: 0,
    deletedOriginalBytes: 0,
    cleanupSkippedReferenced: 0,
    cleanupSkippedMissing: 0,
    cleanupSkippedUnsafe: 0,
    root,
    scanRoot,
    config,
    totalImages: allImages.length,
    scopedImages: sourceImages.length,
    catalogOnly: Boolean(args.catalogOnly),
    totalBytes: sumBytes(allImages),
    candidateImages: candidates.length,
    candidateBytes: sumBytes(candidates),
    processedImages: selected.length,
    processedOriginalBytes: 0,
    processedOptimizedBytes: 0,
    processedWouldSaveBytes: 0,
    skippedBecauseSharpMissing: 0,
    notWorthReplacing: 0,
    failed: 0,
    bestSavings: []
  };

  await runConcurrent(selected, optimizeConcurrency, async (item) => {
    const buffer = await fs.readFile(item.filePath);
    const optimized = await optimizeImageBuffer(buffer, item.name, config);
    if (optimized.reason === 'sharp-not-installed') {
      summary.skippedBecauseSharpMissing += 1;
      return;
    }
    if (!optimized.attempted || !optimized.optimizedBytes) {
      summary.failed += 1;
      return;
    }

    const savingPercent = estimateOptimizationSaving({
      originalBytes: item.bytes,
      optimizedBytes: optimized.optimizedBytes
    });
    const worthReplacing = savingPercent >= config.minSavingPercent;
    const wouldSaveBytes = worthReplacing ? Math.max(0, item.bytes - optimized.optimizedBytes) : 0;
    if (!worthReplacing) summary.notWorthReplacing += 1;

    summary.processedOriginalBytes += item.bytes;
    summary.processedOptimizedBytes += worthReplacing ? optimized.optimizedBytes : item.bytes;
    summary.processedWouldSaveBytes += wouldSaveBytes;
    if (wouldSaveBytes > 0) {
      if (mode === 'apply') {
        const targetPath = path.join(path.dirname(item.filePath), optimized.filename);
        await fs.writeFile(targetPath, optimized.buffer);
        summary.changedFiles += 1;
        const update = updateCatalogPageForOptimizedImage({
          catalog,
          root,
          originalPath: item.filePath,
          optimizedPath: targetPath,
          optimized,
          originalBytes: item.bytes
        });
        if (update) {
          catalogUpdates.set(update.key, update);
          summary.catalogPagesUpdated += 1;
        }
      }
      summary.bestSavings.push({
        path: path.relative(root, item.filePath),
        originalMB: roundMb(item.bytes),
        optimizedMB: roundMb(optimized.optimizedBytes),
        saveMB: roundMb(wouldSaveBytes),
        savePercent: roundOne(savingPercent),
        width: optimized.width || null,
        height: optimized.height || null
      });
      summary.bestSavings.sort((a, b) => b.saveMB - a.saveMB);
      summary.bestSavings = summary.bestSavings.slice(0, 20);
    }
  });

  if (mode === 'apply' && catalogUpdates.size) await writeCatalog(catalog);
  if (mode === 'apply' && args.cleanupOriginals) {
    const cleanup = await cleanupOptimizedOriginals(catalog, root, args.seriesId);
    Object.assign(summary, cleanup);
  }

  printSummary(summary, { json: args.json, partial: !args.all && candidates.length > selected.length });
}

async function collectCatalogImageFilePaths(root, seriesId = '') {
  const catalog = await readCatalog();
  const paths = new Set();
  for (const series of matchingSeries(catalog, seriesId)) {
    for (const chapter of series.chapters || []) {
      for (const page of chapter.pages || []) {
        for (const value of [page.src, page.imageUrl, page.storageKey]) {
          const filePath = importFileFromPublicPath(root, value);
          if (filePath) paths.add(path.resolve(filePath));
        }
      }
    }
  }
  return paths;
}

async function collectImages(root) {
  const images = [];
  async function walk(dir) {
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
        await walk(filePath);
        continue;
      }
      if (!entry.isFile() || !IMAGE_RE.test(entry.name)) continue;
      const stat = await fs.stat(filePath);
      images.push({
        filePath,
        name: entry.name,
        bytes: stat.size
      });
    }
  }
  await walk(root);
  return images;
}

function importFileFromPublicPath(root, value = '') {
  const raw = String(value || '').trim();
  const importPath = extractImportPath(raw);
  if (!importPath) return '';
  const parts = importPath.replace(/^\/imports\//, '').split('/').map((part) => decodeURIComponent(part));
  if (parts.length < 3) return '';
  return path.join(root, ...parts);
}

async function runConcurrent(items, limit, task) {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await task(item);
    }
  });
  await Promise.all(workers);
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
function updateCatalogPageForOptimizedImage({ catalog, root, originalPath, optimizedPath, optimized, originalBytes }) {
  if (!catalog || !Array.isArray(catalog.series)) return null;
  const originalPublicPath = publicPathFromImportFile(root, originalPath);
  const optimizedPublicPath = publicPathFromImportFile(root, optimizedPath);
  for (const series of catalog.series) {
    for (const chapter of series.chapters || []) {
      for (const page of chapter.pages || []) {
        const values = [page.src, page.imageUrl, page.storageKey].filter(Boolean);
        if (!values.includes(originalPublicPath)) continue;
        page.src = optimizedPublicPath;
        page.imageUrl = optimizedPublicPath;
        page.storageKey = optimizedPublicPath;
        page.originalImageUrl = page.originalImageUrl || originalPublicPath;
        page.originalBytes = page.originalBytes || originalBytes;
        page.storedBytes = optimized.optimizedBytes;
        page.optimized = true;
        page.width = optimized.width || page.width || null;
        page.height = optimized.height || page.height || null;
        return {
          key: `${series.id}:${chapter.id}:${page.index ?? page.order ?? 0}`,
          seriesId: series.id,
          chapterId: chapter.id,
          pageIndex: page.index ?? page.order ?? 0,
          from: originalPublicPath,
          to: optimizedPublicPath
        };
      }
    }
  }
  return null;
}

function publicPathFromImportFile(root, filePath) {
  const relative = path.relative(root, filePath).split(path.sep).map(encodeURIComponent).join('/');
  const [seriesId, chapterId, ...rest] = relative.split('/');
  return publicImportPath(decodeURIComponent(seriesId), decodeURIComponent(chapterId), decodeURIComponent(rest.join('/')));
}

async function cleanupOptimizedOriginals(catalog, root, seriesId = '') {
  const result = {
    deletedOriginalFiles: 0,
    deletedOriginalBytes: 0,
    cleanupSkippedReferenced: 0,
    cleanupSkippedMissing: 0,
    cleanupSkippedUnsafe: 0
  };
  if (!catalog || !Array.isArray(catalog.series)) return result;

  const rootPath = path.resolve(root);
  const activeRefs = activeCatalogImportReferences(catalog, rootPath);
  const candidates = new Map();

  for (const series of matchingSeries(catalog, seriesId)) {
    for (const chapter of series.chapters || []) {
      for (const page of chapter.pages || []) {
        if (!page.optimized || !page.originalImageUrl) continue;
        const originalPath = importFileFromPublicPath(rootPath, page.originalImageUrl);
        const activePath = importFileFromPublicPath(rootPath, page.src || page.imageUrl || page.storageKey || '');
        if (!originalPath || !activePath) continue;
        if (path.resolve(originalPath) === path.resolve(activePath)) continue;
        candidates.set(path.resolve(originalPath), {
          originalPath: path.resolve(originalPath),
          activePath: path.resolve(activePath)
        });
      }
    }
  }

  for (const candidate of candidates.values()) {
    if (!isInsideDirectory(candidate.originalPath, rootPath) || !isInsideDirectory(candidate.activePath, rootPath)) {
      result.cleanupSkippedUnsafe += 1;
      continue;
    }
    if (activeRefs.has(candidate.originalPath)) {
      result.cleanupSkippedReferenced += 1;
      continue;
    }
    try {
      await fs.access(candidate.activePath);
    } catch {
      result.cleanupSkippedMissing += 1;
      continue;
    }

    let stat;
    try {
      stat = await fs.stat(candidate.originalPath);
    } catch {
      result.cleanupSkippedMissing += 1;
      continue;
    }
    if (!stat.isFile()) {
      result.cleanupSkippedUnsafe += 1;
      continue;
    }

    await fs.rm(candidate.originalPath, { force: true });
    result.deletedOriginalFiles += 1;
    result.deletedOriginalBytes += stat.size;
  }

  return result;
}

function activeCatalogImportReferences(catalog, root) {
  const refs = new Set();
  for (const series of catalog.series || []) {
    addActiveRef(refs, root, series.coverUrl);
    addActiveRef(refs, root, series.thumbnailUrl);
    addActiveRef(refs, root, series.coverThumbnailUrl);
    for (const chapter of series.chapters || []) {
      for (const page of chapter.pages || []) {
        addActiveRef(refs, root, page.src);
        addActiveRef(refs, root, page.imageUrl);
        addActiveRef(refs, root, page.storageKey);
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

function addActiveRef(refs, root, value) {
  const filePath = importFileFromPublicPath(root, value);
  if (filePath) refs.add(path.resolve(filePath));
}

function isInsideDirectory(filePath, dir) {
  const resolvedFile = path.resolve(filePath);
  const resolvedDir = path.resolve(dir);
  return resolvedFile === resolvedDir || resolvedFile.startsWith(`${resolvedDir}${path.sep}`);
}

function printSummary(summary, { json = false, partial = false } = {}) {
  const view = {
    ...summary,
    totalGB: roundGb(summary.totalBytes),
    candidateGB: roundGb(summary.candidateBytes),
    processedOriginalMB: roundMb(summary.processedOriginalBytes),
    processedOptimizedMB: roundMb(summary.processedOptimizedBytes),
    processedWouldSaveMB: roundMb(summary.processedWouldSaveBytes),
    deletedOriginalMB: roundMb(summary.deletedOriginalBytes),
    processedSavingPercent: roundOne(estimateOptimizationSaving({
      originalBytes: summary.processedOriginalBytes,
      optimizedBytes: summary.processedOptimizedBytes
    }))
  };

  if (json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }

  const applyMessage = summary.deletedOriginalFiles
    ? 'Optimized copies were written; replaced originals were deleted when safe.'
    : 'Optimized copies were written; originals were kept unless cleanup removed safe replacements.';
  console.log(`Image optimization ${summary.mode}. ${summary.mode === 'dry-run' ? 'No files were changed.' : applyMessage}`);
  console.log(`Root: ${view.root}`);
  console.log(`Total images: ${view.totalImages} (${view.totalGB} GiB)`);
  console.log(`Candidates: ${view.candidateImages} (${view.candidateGB} GiB)`);
  console.log(`Processed: ${view.processedImages}${partial ? ' largest candidates only' : ''}`);
  if (view.skippedBecauseSharpMissing) {
    console.log('Sharp is not installed, so exact dry-run compression could not run.');
    console.log('Run npm install first, then run this script again.');
    return;
  }
  console.log(`Processed original: ${view.processedOriginalMB} MiB`);
  console.log(`Processed optimized estimate: ${view.processedOptimizedMB} MiB`);
  console.log(`Would save: ${view.processedWouldSaveMB} MiB (${view.processedSavingPercent}%)`);
  if (summary.mode === 'apply') {
    console.log(`Changed files: ${summary.changedFiles}; catalog pages updated: ${summary.catalogPagesUpdated}`);
    if (summary.deletedOriginalFiles || summary.cleanupSkippedReferenced || summary.cleanupSkippedMissing || summary.cleanupSkippedUnsafe) {
      console.log(`Deleted old originals: ${summary.deletedOriginalFiles} (${view.deletedOriginalMB} MiB)`);
      console.log(`Cleanup skipped: referenced=${summary.cleanupSkippedReferenced}; missing=${summary.cleanupSkippedMissing}; unsafe=${summary.cleanupSkippedUnsafe}`);
    }
  }
  if (partial) console.log('Use --all for an exact full-catalog dry-run.');
  if (view.bestSavings.length) {
    console.log('\nTop potential savings:');
    for (const item of view.bestSavings.slice(0, 10)) {
      console.log(`- ${item.path}: save ${item.saveMB} MiB (${item.savePercent}%)`);
    }
  }
}

function parseArgs(args) {
  const parsed = {
    all: false,
    json: false,
    apply: false,
    catalogOnly: false,
    cleanupOriginals: false,
    concurrency: 0,
    seriesId: '',
    limit: 500,
    root: ''
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--all') parsed.all = true;
    else if (arg === '--apply') parsed.apply = true;
    else if (arg === '--catalog-only') parsed.catalogOnly = true;
    else if (arg === '--cleanup-originals') parsed.cleanupOriginals = true;
    else if (arg === '--concurrency') parsed.concurrency = Number(args[index += 1] || 0);
    else if (arg === '--series-id') parsed.seriesId = args[index += 1] || '';
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--limit') parsed.limit = Number(args[index += 1] || parsed.limit);
    else if (arg === '--root') parsed.root = args[index += 1] || '';
  }
  return parsed;
}

function sumBytes(items) {
  return items.reduce((sum, item) => sum + Number(item.bytes || 0), 0);
}

function roundMb(bytes) {
  return Math.round((Number(bytes || 0) / 1024 / 1024) * 10) / 10;
}

function roundGb(bytes) {
  return Math.round((Number(bytes || 0) / 1024 / 1024 / 1024) * 1000) / 1000;
}

function roundOne(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
