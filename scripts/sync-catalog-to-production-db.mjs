import '../server/env.mjs';

import { closePostgresPool, upsertSeriesInPostgres } from '../server/postgresStore.mjs';
import { getSeries } from '../server/dataStore.mjs';
import { catalogStorageSummary, maskPostgresCatalogUrl, productionPostgresCatalogUrl } from '../server/storageConfig.mjs';

const args = new Set(process.argv.slice(2));
const seriesId = valueArg('--series-id') || valueArg('--series') || '';
const apply = args.has('--apply');
const targetUrl = productionDatabaseUrl();
const targetSummary = catalogStorageSummary({
  CATALOG_STORAGE: 'postgres',
  CATALOG_DATABASE_URL: targetUrl,
  POSTGRES_SSL_REJECT_UNAUTHORIZED: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED
}).postgres;
const sourceUrl = String(process.env.CATALOG_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
const sameDatabase = Boolean(sourceUrl && targetUrl && sourceUrl === targetUrl);

if (!seriesId) {
  fail('Missing --series-id <series-id>. Production DB sync is intentionally scoped by series.');
}

if (!targetUrl) {
  fail('Missing PRODUCTION_CATALOG_DATABASE_URL or PRODUCTION_DATABASE_URL. Set a dedicated production Supabase/Postgres URL before syncing catalog DB.');
}

const sourceStorage = catalogStorageSummary();
const series = await getSeries(seriesId, { includePages: true, includeDraft: true });
await closePostgresPool();

if (!series) {
  fail(`Series not found in local catalog: ${seriesId}`);
}

const chapterCount = Array.isArray(series.chapters) ? series.chapters.length : 0;
const pageCount = (series.chapters || []).reduce((sum, chapter) => (
  sum + (Array.isArray(chapter.pages) ? chapter.pages.length : 0)
), 0);

if (!apply) {
  console.log(JSON.stringify({
    ok: true,
    dryRun: true,
    message: 'Dry-run only. Re-run with --apply to upsert this series into production DB.',
    series: seriesSummary(series, chapterCount, pageCount),
    sourceStorage,
    sameDatabase,
    target: targetSummary,
    targetUrl: maskPostgresCatalogUrl(targetUrl)
  }, null, 2));
  process.exit(0);
}

process.env.CATALOG_STORAGE = 'postgres';
process.env.CATALOG_STORAGE_MODE = 'postgres';
process.env.CATALOG_DATABASE_URL = targetUrl;
process.env.DATABASE_URL = targetUrl;

await upsertSeriesInPostgres(series);
await closePostgresPool();

console.log(JSON.stringify({
  ok: true,
  dryRun: false,
  message: 'Synced series catalog to production DB.',
  series: seriesSummary(series, chapterCount, pageCount),
  sourceStorage,
  sameDatabase,
  target: targetSummary,
  targetUrl: maskPostgresCatalogUrl(targetUrl)
}, null, 2));

function productionDatabaseUrl() {
  return productionPostgresCatalogUrl();
}

function valueArg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return '';
  return String(process.argv[index + 1] || '').trim();
}

function seriesSummary(series, chapterCount, pageCount) {
  return {
    id: series.id || '',
    slug: series.slug || '',
    title: series.title || '',
    status: series.status || '',
    chapterCount,
    pageCount
  };
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
