import { readCatalog as readJsonCatalog } from '../server/catalogStore.mjs';
import { ensureStorageSchema, usesPostgresStorage, writeCatalog } from '../server/dataStore.mjs';

if (!usesPostgresStorage()) {
  console.error('DATABASE_URL or POSTGRES_URL is required before running this migration.');
  process.exitCode = 1;
} else {
  const catalog = await readJsonCatalog();
  await ensureStorageSchema();
  await writeCatalog(catalog);
  const seriesCount = catalog.series?.length || 0;
  const chapterCount = (catalog.series || [])
    .reduce((sum, series) => sum + (series.chapters?.length || 0), 0);
  const pageCount = (catalog.series || [])
    .reduce((sum, series) => sum + (series.chapters || [])
      .reduce((inner, chapter) => inner + (chapter.pages?.length || 0), 0), 0);

  console.log(JSON.stringify({
    ok: true,
    storage: 'postgres',
    seriesCount,
    chapterCount,
    pageCount
  }, null, 2));
}
