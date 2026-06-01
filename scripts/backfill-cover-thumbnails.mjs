import fs from 'node:fs/promises';
import path from 'node:path';

import { IMPORT_ROOT, publicImportPath } from '../server/catalogStore.mjs';
import { readCatalog, writeCatalog } from '../server/dataStore.mjs';
import {
  coverThumbnailConfig,
  createThumbnailBuffer,
  writeCoverThumbnail
} from '../server/imageOptimizer.mjs';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || IMPORT_ROOT);
  const config = coverThumbnailConfig(process.env);
  const mode = args.apply ? 'apply' : 'dry-run';
  const catalog = await readCatalog();
  const seriesList = (catalog.series || []).slice(0, args.limit || undefined);
  const summary = {
    mode,
    root,
    totalSeries: catalog.series?.length || 0,
    processedSeries: seriesList.length,
    createdThumbnails: 0,
    existingThumbnails: 0,
    skippedNoSource: 0,
    skippedFailed: 0,
    skippedUnsafe: 0,
    sourceBytes: 0,
    thumbnailBytes: 0
  };

  for (const series of seriesList) {
    if (!args.overwrite && await hasExistingLocalThumbnail(root, series.thumbnailUrl || series.coverThumbnailUrl)) {
      summary.existingThumbnails += 1;
      continue;
    }

    const source = await resolveCoverSource(root, series);
    if (!source) {
      summary.skippedNoSource += 1;
      continue;
    }
    if (!isInsideDirectory(source.filePath, root)) {
      summary.skippedUnsafe += 1;
      continue;
    }

    let buffer;
    try {
      buffer = await fs.readFile(source.filePath);
    } catch {
      summary.skippedNoSource += 1;
      continue;
    }

    const preview = await createThumbnailBuffer(buffer, 'cover', config);
    if (!preview.attempted || !preview.buffer) {
      summary.skippedFailed += 1;
      continue;
    }

    summary.sourceBytes += buffer.length;
    summary.thumbnailBytes += preview.storedBytes;
    summary.createdThumbnails += 1;

    if (mode === 'apply') {
      const coverChapterId = '_cover';
      const targetDir = path.resolve(root, series.id, coverChapterId);
      if (!isInsideDirectory(targetDir, root)) {
        summary.skippedUnsafe += 1;
        summary.createdThumbnails -= 1;
        continue;
      }
      const thumbnail = await writeCoverThumbnail({
        buffer,
        dir: targetDir,
        filename: 'cover',
        config
      });
      if (!thumbnail) {
        summary.skippedFailed += 1;
        summary.createdThumbnails -= 1;
        continue;
      }
      series.thumbnailUrl = publicImportPath(series.id, coverChapterId, thumbnail.filename);
      series.coverThumbnail = {
        sourceUrl: source.publicPath,
        sourceType: source.sourceType,
        width: thumbnail.width || null,
        height: thumbnail.height || null,
        sourceBytes: thumbnail.sourceBytes || null,
        storedBytes: thumbnail.storedBytes || null,
        format: thumbnail.format || ''
      };
    }
  }

  if (mode === 'apply' && summary.createdThumbnails) await writeCatalog(catalog);
  printSummary(summary, { json: args.json });
}

async function hasExistingLocalThumbnail(root, value = '') {
  const filePath = importFileFromPublicPath(root, value);
  if (!filePath) return false;
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function resolveCoverSource(root, series = {}) {
  const localCover = importFileFromPublicPath(root, series.coverUrl || series.cover || '');
  if (localCover && await isReadableFile(localCover)) {
    return {
      filePath: path.resolve(localCover),
      publicPath: series.coverUrl || series.cover || '',
      sourceType: 'cover'
    };
  }

  for (const chapter of series.chapters || []) {
    for (const page of chapter.pages || []) {
      const publicPath = page.src || page.imageUrl || page.storageKey || '';
      const pagePath = importFileFromPublicPath(root, publicPath);
      if (pagePath && await isReadableFile(pagePath)) {
        return {
          filePath: path.resolve(pagePath),
          publicPath,
          sourceType: 'first-page'
        };
      }
    }
  }
  return null;
}

async function isReadableFile(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function importFileFromPublicPath(root, value = '') {
  const raw = String(value || '');
  if (!raw.startsWith('/imports/')) return '';
  const parts = raw.replace(/^\/imports\//, '').split('/').map((part) => decodeURIComponent(part));
  if (parts.length < 3) return '';
  return path.join(root, ...parts);
}

function isInsideDirectory(filePath, dir) {
  const resolvedFile = path.resolve(filePath);
  const resolvedDir = path.resolve(dir);
  return resolvedFile === resolvedDir || resolvedFile.startsWith(`${resolvedDir}${path.sep}`);
}

function parseArgs(args) {
  const parsed = {
    apply: false,
    json: false,
    overwrite: false,
    limit: 0,
    root: ''
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--apply') parsed.apply = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--overwrite') parsed.overwrite = true;
    else if (arg === '--limit') parsed.limit = Number(args[index += 1] || 0);
    else if (arg === '--root') parsed.root = args[index += 1] || '';
  }
  return parsed;
}

function printSummary(summary, { json = false } = {}) {
  const view = {
    ...summary,
    sourceMB: roundMb(summary.sourceBytes),
    thumbnailMB: roundMb(summary.thumbnailBytes)
  };
  if (json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }
  console.log(`Cover thumbnail backfill ${summary.mode}. ${summary.mode === 'dry-run' ? 'No files were changed.' : 'Catalog thumbnailUrl values were updated.'}`);
  console.log(`Root: ${summary.root}`);
  console.log(`Series: ${summary.processedSeries}/${summary.totalSeries}`);
  console.log(`Created thumbnails: ${summary.createdThumbnails}`);
  console.log(`Existing thumbnails: ${summary.existingThumbnails}`);
  console.log(`Skipped: no-source=${summary.skippedNoSource}; failed=${summary.skippedFailed}; unsafe=${summary.skippedUnsafe}`);
  console.log(`Source: ${view.sourceMB} MiB; thumbnails: ${view.thumbnailMB} MiB`);
}

function roundMb(bytes) {
  return Math.round((Number(bytes || 0) / 1024 / 1024) * 10) / 10;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
