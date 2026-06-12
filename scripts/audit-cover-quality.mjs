import '../server/env.mjs';

import path from 'node:path';
import sharp from 'sharp';

import { readCatalog } from '../server/dataStore.mjs';
import { closePostgresPool } from '../server/postgresStore.mjs';

function localImportPath(root, value = '') {
  const raw = String(value || '');
  if (!raw.startsWith('/imports/')) return '';
  const parts = raw.replace(/^\/imports\//, '').split('/').map((part) => decodeURIComponent(part));
  return path.resolve(root, ...parts);
}

function ratioLabel(width, height) {
  return height ? Math.round((Number(width || 0) / Number(height || 1)) * 100) / 100 : null;
}

async function imageMetadata(filePath) {
  if (!filePath) return {};
  try {
    return await sharp(filePath).metadata();
  } catch (error) {
    return { error: error.message || String(error) };
  }
}

async function auditCoverQuality({ root = 'data/imports' } = {}) {
  const importRoot = path.resolve(root);
  const catalog = await readCatalog({ includePages: false });
  const rows = [];
  for (const series of catalog.series || []) {
    const displayUrl = series.thumbnailUrl || series.coverThumbnailUrl || series.coverUrl || series.imageUrl || '';
    const filePath = localImportPath(importRoot, displayUrl);
    const meta = await imageMetadata(filePath);
    const width = Number(series.coverThumbnail?.width || meta.width || 0);
    const height = Number(series.coverThumbnail?.height || meta.height || 0);
    const ratio = ratioLabel(width, height);
    const sourceType = series.coverThumbnail?.sourceType || '';
    const suspiciousReasons = [];
    if (!displayUrl) suspiciousReasons.push('missing-display-cover');
    if (sourceType === 'first-page') suspiciousReasons.push('thumbnail-from-first-page');
    if (ratio && ratio > 1.1) suspiciousReasons.push('wide-cover-ratio');
    if (meta.error) suspiciousReasons.push('local-image-unreadable');
    rows.push({
      id: series.id || '',
      slug: series.slug || '',
      title: series.title || '',
      status: series.status || '',
      displayUrl,
      coverUrl: series.coverUrl || '',
      thumbnailUrl: series.thumbnailUrl || '',
      sourceType,
      width,
      height,
      ratio,
      suspiciousReasons,
      error: meta.error || ''
    });
  }
  return {
    total: rows.length,
    suspiciousCount: rows.filter((row) => row.suspiciousReasons.length).length,
    suspicious: rows.filter((row) => row.suspiciousReasons.length)
  };
}

const audit = await auditCoverQuality();
console.log(JSON.stringify(audit, null, 2));
await closePostgresPool();
