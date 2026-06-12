import '../server/env.mjs';

import { chapterDir, publicImportPath } from '../server/catalogStore.mjs';
import { getSeries, readCatalog, upsertSeries } from '../server/dataStore.mjs';
import { getAdapterForUrl } from '../server/adapters/index.mjs';
import { closePostgresPool } from '../server/postgresStore.mjs';
import { coverThumbnailConfig, createThumbnailBuffer, writeCoverThumbnail } from '../server/imageOptimizer.mjs';

function parseArgs(args) {
  const parsed = {
    apply: false,
    json: false,
    seriesId: '',
    includeDraft: false,
    onlySuspicious: true
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--apply') parsed.apply = true;
    else if (arg === '--json') parsed.json = true;
    else if (arg === '--series-id') parsed.seriesId = args[index += 1] || '';
    else if (arg === '--include-draft') parsed.includeDraft = true;
    else if (arg === '--all') parsed.onlySuspicious = false;
  }
  return parsed;
}

function sourceUrlForSeries(series = {}) {
  return series.sourceUrl || (series.sourceMappings || []).find((mapping) => mapping?.sourceUrl)?.sourceUrl || '';
}

function currentCoverRatio(series = {}) {
  const width = Number(series.coverThumbnail?.width || 0);
  const height = Number(series.coverThumbnail?.height || 0);
  return height ? width / height : 0;
}

function suspiciousCoverReasons(series = {}) {
  const displayUrl = series.thumbnailUrl || series.coverThumbnailUrl || series.coverUrl || series.imageUrl || '';
  const reasons = [];
  if (!displayUrl) reasons.push('missing-display-cover');
  if (series.coverThumbnail?.sourceType === 'first-page') reasons.push('thumbnail-from-first-page');
  if (currentCoverRatio(series) > 1.1) reasons.push('wide-cover-ratio');
  return reasons;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 ComicReaderPrototype/0.1'
    }
  });
  if (!response.ok) throw new Error(`Source page fetch failed ${response.status}`);
  return response.text();
}

async function fetchImageBuffer(url, refererUrl) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 ComicReaderPrototype/0.1',
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      referer: refererUrl || new URL(url).origin
    }
  });
  if (!response.ok) throw new Error(`Cover image fetch failed ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function thumbnailRatio(thumbnail = {}) {
  const width = Number(thumbnail.width || 0);
  const height = Number(thumbnail.height || 0);
  return height ? width / height : 0;
}

async function refreshSeriesCover(series, { apply = false } = {}) {
  const sourceUrl = sourceUrlForSeries(series);
  if (!sourceUrl) return { id: series.id, title: series.title, action: 'skipped', reason: 'missing-source-url' };
  const currentReasons = suspiciousCoverReasons(series);
  const adapter = getAdapterForUrl(sourceUrl);
  const html = await fetchText(sourceUrl);
  const parsed = adapter.parseSeriesPage(html, sourceUrl);
  const coverUrl = parsed.coverUrl || '';
  if (!coverUrl) return { id: series.id, title: series.title, action: 'skipped', reason: 'missing-source-cover', currentReasons };

  const buffer = await fetchImageBuffer(coverUrl, sourceUrl);
  const config = coverThumbnailConfig();
  const preview = await createThumbnailBuffer(buffer, 'cover', config);
  if (!preview?.attempted || !preview.buffer) {
    return { id: series.id, title: series.title, action: 'skipped', reason: preview?.reason || 'thumbnail-failed', coverUrl, currentReasons };
  }
  const thumbnail = apply
    ? await writeCoverThumbnail({
      buffer,
      dir: await chapterDir(series.id, '_cover'),
      filename: 'cover',
      config
    })
    : {
      filename: preview.filename,
      sourceBytes: preview.sourceBytes,
      storedBytes: preview.storedBytes,
      width: preview.width,
      height: preview.height,
      format: preview.format
    };
  if (!thumbnail) return { id: series.id, title: series.title, action: 'skipped', reason: 'thumbnail-failed', coverUrl, currentReasons };
  if (thumbnailRatio(thumbnail) > 1.1) {
    return {
      id: series.id,
      title: series.title,
      action: 'skipped',
      reason: 'source-cover-wide-ratio',
      coverUrl,
      width: thumbnail.width,
      height: thumbnail.height,
      currentReasons
    };
  }

  const thumbnailUrl = publicImportPath(series.id, '_cover', thumbnail.filename);
  const updated = {
    ...series,
    coverUrl,
    thumbnailUrl,
    coverThumbnail: {
      sourceUrl: coverUrl,
      sourceType: 'source-cover',
      width: thumbnail.width || null,
      height: thumbnail.height || null,
      sourceBytes: thumbnail.sourceBytes || null,
      storedBytes: thumbnail.storedBytes || null,
      format: thumbnail.format || ''
    },
    updatedAt: new Date().toISOString()
  };
  if (apply) await upsertSeries(updated);
  return {
    id: series.id,
    slug: series.slug,
    title: series.title,
    action: apply ? 'updated' : 'planned',
    currentReasons,
    coverUrl,
    thumbnailUrl,
    width: thumbnail.width,
    height: thumbnail.height
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const catalog = await readCatalog({ includePages: false });
  const candidates = (catalog.series || [])
    .filter((series) => args.includeDraft || series.status === 'public')
    .filter((series) => !args.seriesId || series.id === args.seriesId || series.slug === args.seriesId)
    .filter((series) => !args.onlySuspicious || suspiciousCoverReasons(series).length);
  const results = [];
  for (const candidate of candidates) {
    try {
      const fullSeries = await getSeries(candidate.id, { includePages: true });
      if (!fullSeries) {
        results.push({ id: candidate.id, title: candidate.title, action: 'skipped', reason: 'series-not-found' });
        continue;
      }
      results.push(await refreshSeriesCover(fullSeries, { apply: args.apply }));
    } catch (error) {
      results.push({
        id: candidate.id,
        title: candidate.title,
        action: 'failed',
        reason: error.message || String(error),
        currentReasons: suspiciousCoverReasons(candidate)
      });
    }
  }
  const summary = {
    mode: args.apply ? 'apply' : 'dry-run',
    totalCandidates: candidates.length,
    updated: results.filter((result) => result.action === 'updated').length,
    planned: results.filter((result) => result.action === 'planned').length,
    skipped: results.filter((result) => result.action === 'skipped').length,
    failed: results.filter((result) => result.action === 'failed').length,
    results
  };
  if (args.json) console.log(JSON.stringify(summary, null, 2));
  else {
    console.log(`Refresh source covers ${summary.mode}: candidates=${summary.totalCandidates} updated=${summary.updated} planned=${summary.planned} skipped=${summary.skipped} failed=${summary.failed}`);
    for (const result of results) console.log(JSON.stringify(result));
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePostgresPool();
  });
