import '../server/env.mjs';

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
  const seriesList = (catalog.series || [])
    .filter((series) => matchesSeriesFilter(series, args.seriesId))
    .slice(0, args.limit || undefined);
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
    promotedCovers: 0,
    changedSeries: [],
    sourceBytes: 0,
    thumbnailBytes: 0,
    allowFirstPageFallback: args.allowFirstPageFallback
  };

  for (const series of seriesList) {
    const existingThumbnail = series.thumbnailUrl || series.coverThumbnailUrl || '';
    if (!args.overwrite && await hasExistingLocalThumbnail(root, existingThumbnail)) {
      if (args.promoteCover && promoteCoverToThumbnail(series, existingThumbnail)) {
        summary.promotedCovers += 1;
        summary.changedSeries.push(seriesSummary(series, 'promoted-cover'));
      }
      summary.existingThumbnails += 1;
      continue;
    }

    const source = await resolveCoverSource(root, series, {
      allowFirstPageFallback: args.allowFirstPageFallback
    });
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
      if (args.promoteCover && promoteCoverToThumbnail(series, series.thumbnailUrl)) {
        summary.promotedCovers += 1;
      }
      summary.changedSeries.push(seriesSummary(series, 'created-thumbnail'));
    }
  }

  if (mode === 'apply' && (summary.createdThumbnails || summary.promotedCovers)) await writeCatalog(catalog);
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

async function resolveCoverSource(root, series = {}, { allowFirstPageFallback = false } = {}) {
  const localCover = importFileFromPublicPath(root, series.coverUrl || series.cover || '');
  if (localCover && await isReadableFile(localCover)) {
    return {
      filePath: path.resolve(localCover),
      publicPath: series.coverUrl || series.cover || '',
      sourceType: 'cover'
    };
  }

  if (!allowFirstPageFallback) return null;

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
    promoteCover: false,
    allowFirstPageFallback: false,
    limit: 0,
    seriesId: '',
    root: ''
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--apply') parsed.apply = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--overwrite') parsed.overwrite = true;
    else if (arg === '--promote-cover') parsed.promoteCover = true;
    else if (arg === '--allow-first-page-fallback') parsed.allowFirstPageFallback = true;
    else if (arg === '--limit') parsed.limit = Number(args[index += 1] || 0);
    else if (arg === '--series-id') parsed.seriesId = args[index += 1] || '';
    else if (arg === '--root') parsed.root = args[index += 1] || '';
  }
  return parsed;
}

function matchesSeriesFilter(series = {}, seriesId = '') {
  const target = String(seriesId || '').trim();
  if (!target) return true;
  return series.id === target || series.slug === target;
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
  console.log(`Promoted covers: ${summary.promotedCovers}`);
  console.log(`First-page fallback: ${summary.allowFirstPageFallback ? 'enabled' : 'disabled'}`);
  console.log(`Skipped: no-source=${summary.skippedNoSource}; failed=${summary.skippedFailed}; unsafe=${summary.skippedUnsafe}`);
  console.log(`Source: ${view.sourceMB} MiB; thumbnails: ${view.thumbnailMB} MiB`);
}

function promoteCoverToThumbnail(series, thumbnailUrl = '') {
  if (!thumbnailUrl || !thumbnailUrl.startsWith('/imports/')) return false;
  if (!/^https?:\/\//i.test(String(series.coverUrl || ''))) return false;
  if (series.coverUrl === thumbnailUrl) return false;
  series.coverUrl = thumbnailUrl;
  return true;
}

function seriesSummary(series, action) {
  return {
    id: series.id || '',
    slug: series.slug || '',
    title: series.title || '',
    action,
    thumbnailUrl: series.thumbnailUrl || series.coverThumbnailUrl || '',
    coverUrl: series.coverUrl || ''
  };
}

function roundMb(bytes) {
  return Math.round((Number(bytes || 0) / 1024 / 1024) * 10) / 10;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
