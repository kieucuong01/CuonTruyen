import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const DEFAULT_OUTPUT_DIR = path.join(ROOT, '.runtime', 'static-api');

async function loadEnvFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const index = line.indexOf('=');
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, '');
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function trimTrailingSlash(value = '') {
  return String(value || '').trim().replace(/\/$/, '');
}

function safeSegment(value = '') {
  return encodeURIComponent(String(value || '').trim());
}

function publicImportsBaseFromEnv() {
  return trimTrailingSlash(
    process.env.PUBLIC_IMPORTS_BASE_URL
    || process.env.S3_PUBLIC_BASE_URL
    || process.env.VIETNIX_S3_PUBLIC_BASE_URL
    || ''
  );
}

function json(value) {
  return `${JSON.stringify(value)}\n`;
}

async function writeJson(root, relativePath, value) {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, json(value), 'utf8');
}

async function removeOutputDir(outputDir) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code) || attempt === 7) throw error;
      await new Promise((resolve) => setTimeout(resolve, 80 * (attempt + 1)));
    }
  }
}

function searchSeriesShape(series) {
  return {
    ...series,
    chapters: Array.isArray(series.chapters) ? series.chapters.slice(0, 3) : []
  };
}

function compactImportUrl(value = '', publicImportsBase = '') {
  const url = String(value || '');
  const base = trimTrailingSlash(publicImportsBase);
  if (base && url.startsWith(`${base}/imports/`)) return url.slice(base.length);
  return url;
}

function compactReaderPage(page = {}, publicImportsBase = '') {
  return [
    Number(page.order ?? page.index ?? 0),
    compactImportUrl(page.imageUrl || page.src || '', publicImportsBase),
    page.width || null,
    page.height || null
  ];
}

function compactReaderChapter(chapter = {}, publicImportsBase = '') {
  return {
    ...chapter,
    pages: (chapter.pages || []).map((page) => compactReaderPage(page, publicImportsBase))
  };
}

export async function main() {
  await loadEnvFile(path.join(ROOT, '.env.local'));
  await loadEnvFile(path.join(ROOT, '.env'));

  const outputDir = path.resolve(process.env.STATIC_API_OUTPUT_DIR || DEFAULT_OUTPUT_DIR);
  const publicImportsBase = publicImportsBaseFromEnv();
  if (publicImportsBase && !process.env.PUBLIC_IMPORTS_BASE_URL) {
    process.env.PUBLIC_IMPORTS_BASE_URL = publicImportsBase;
  }
  if (publicImportsBase) process.env.PUBLIC_IMPORTS_BASE_URL_ENABLED = 'true';

  const {
    buildHomeCollections,
    buildTagPage,
    normalizeSeries,
    publicCatalog,
    publicChapterSummary,
    publicReaderChapter,
    publicReaderSeriesSummary,
    publicSeriesDetail
  } = await import('../server/contentStore.mjs');
  const { readCatalog } = await import('../server/dataStore.mjs');

  const catalog = await readCatalog();
  const publicData = publicCatalog(catalog);
  const home = buildHomeCollections(catalog);

  await removeOutputDir(outputDir);
  await fs.mkdir(outputDir, { recursive: true });
  await writeJson(outputDir, 'home.json', home);
  await writeJson(outputDir, 'series.json', publicData);
  await writeJson(outputDir, 'search-index.json', {
    series: publicData.series.map(searchSeriesShape)
  });

  let seriesCount = 0;
  let chapterPayloadCount = 0;
  let tagCount = 0;

  for (const series of publicData.series) {
    const rawSeries = (catalog.series || []).find((item) => item.id === series.id) || series;
    const detail = publicSeriesDetail(rawSeries);
    await writeJson(outputDir, path.join('series', `${safeSegment(series.slug)}.json`), detail);
    await writeJson(outputDir, path.join('series', `${safeSegment(series.id)}.json`), detail);
    seriesCount += 1;

    const readerChapters = normalizeSeries(rawSeries).chapters
      .filter((chapter) => chapter.status === 'public' && Array.isArray(chapter.pages) && chapter.pages.length > 0);
    const seriesSummary = publicReaderSeriesSummary(rawSeries);

    for (let index = 0; index < readerChapters.length; index += 1) {
      const chapter = readerChapters[index];
      const chapterKey = chapter.slug || chapter.id;
      const nextChapter = readerChapters[index + 1] || null;
      const payload = {
        series: seriesSummary,
        chapter: compactReaderChapter(publicReaderChapter(chapter), publicImportsBase),
        chapters: [compactReaderChapter(publicReaderChapter(chapter), publicImportsBase)],
        previousChapter: index > 0 ? publicChapterSummary(readerChapters[index - 1]) : null,
        nextChapter: nextChapter ? publicChapterSummary(nextChapter) : null
      };
      if (payload) {
        await writeJson(outputDir, path.join('reader', safeSegment(series.slug), `${safeSegment(chapterKey)}.json`), payload);
        chapterPayloadCount += 1;
      }
    }
  }

  for (const tag of home.tags || []) {
    const page = buildTagPage(catalog, tag.slug);
    if (!page) continue;
    await writeJson(outputDir, path.join('tags', `${safeSegment(tag.slug)}.json`), page);
    tagCount += 1;
  }

  await writeJson(outputDir, 'manifest.json', {
    generatedAt: new Date().toISOString(),
    publicImportsBaseUrl: publicImportsBase || process.env.PUBLIC_IMPORTS_BASE_URL || '',
    seriesCount,
    chapterPayloadCount,
    tagCount
  });

  console.log(`[static-api] exported ${seriesCount} series, ${chapterPayloadCount} reader payloads, ${tagCount} tags to ${outputDir}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
