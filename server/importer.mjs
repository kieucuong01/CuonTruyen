import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { chapterDir, publicImportPath } from './catalogStore.mjs';
import { getAdapterForUrl } from './adapters/index.mjs';
import { DomainRateLimiter, retryOperation } from './crawlRuntime.mjs';
import { getSeries, upsertSeries } from './dataStore.mjs';
import {
  coverThumbnailConfig,
  findExistingStoredImage,
  imageOptimizationConfig,
  writeCoverThumbnail,
  writeImageWithOptimization
} from './imageOptimizer.mjs';
import { normalizeSourceUrl } from './crawlQueue.mjs';
import { slugify } from './utils.mjs';

const CRAWL_MODE_NEW_CHAPTERS = 'new-chapters';

function chapterKeys(chapter = {}) {
  return [
    chapter.id,
    chapter.slug,
    slugify(chapter.label || chapter.title || '')
  ].map((value) => String(value || '').trim()).filter(Boolean);
}

function chapterSourceUrl(chapter = {}) {
  return normalizeSourceUrl(chapter.sourceUrl || chapter.url || '');
}

export function selectNewChaptersForImport(parsedChapters = [], existingChapters = []) {
  const existingUrls = new Set(
    existingChapters
      .map(chapterSourceUrl)
      .filter(Boolean)
  );
  const existingKeys = new Set(existingChapters.flatMap(chapterKeys));
  const chapters = parsedChapters.filter((chapter) => {
    const url = chapterSourceUrl(chapter);
    if (url && existingUrls.has(url)) return false;
    return !chapterKeys(chapter).some((key) => existingKeys.has(key));
  });
  return {
    chapters,
    skippedExistingChapterCount: parsedChapters.length - chapters.length
  };
}

export function resolveImportedChapterStatus({
  mode = 'full',
  publishNewChapters = false,
  existingSeries = null
} = {}) {
  if (mode === CRAWL_MODE_NEW_CHAPTERS && publishNewChapters && existingSeries?.status === 'public') return 'public';
  return 'draft';
}

async function fetchImageBuffer(url, refererUrl) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 ComicReaderPrototype/0.1',
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      referer: refererUrl || new URL(url).origin
    }
  });
  if (!response.ok) throw new Error(`Image fetch failed ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchHtmlWithLimit(adapter, url, rateLimiter) {
  await rateLimiter.wait(url);
  return adapter.fetchHtml(url);
}

export async function importSeries(seriesUrl, options = {}, onProgress = () => {}) {
  const adapter = getAdapterForUrl(seriesUrl);
  const mode = options.mode === CRAWL_MODE_NEW_CHAPTERS ? CRAWL_MODE_NEW_CHAPTERS : 'full';
  const maxChapters = Number(options.maxChapters || 0);
  const maxPages = Number(options.maxPages || 0);
  const imageRetries = Number(options.imageRetries ?? process.env.CRAWL_IMAGE_RETRIES ?? 2);
  const imageOptimizeConfig = options.imageOptimizeConfig || imageOptimizationConfig();
  const thumbnailConfig = options.coverThumbnailConfig || coverThumbnailConfig();
  const rateLimiter = options.rateLimiter || new DomainRateLimiter({
    minDelayMs: Number(options.domainDelayMs ?? process.env.CRAWL_DOMAIN_DELAY_MS ?? 650)
  });
  const errors = [];
  const emitProgress = (patch) => Promise.resolve(onProgress(patch));
  await emitProgress({
    phase: 'fetching-series',
    message: 'Đang lấy metadata và danh sách chapter...'
  });
  const html = await fetchHtmlWithLimit(adapter, seriesUrl, rateLimiter);
  const parsed = adapter.parseSeriesPage(html, seriesUrl);
  if (!parsed.chapters.length) {
    throw new Error('Không tìm thấy danh sách chapter hợp lệ trong trang truyện.');
  }
  const id = String(options.seriesId || `${parsed.slug}-${Math.abs(hashCode(seriesUrl)).toString(36)}`);
  const existingSeries = mode === CRAWL_MODE_NEW_CHAPTERS
    ? (options.existingSeries || await getSeries(id, { includePages: true, includeDraft: true }))
    : null;
  if (mode === CRAWL_MODE_NEW_CHAPTERS && !existingSeries) {
    throw new Error('Không tìm thấy truyện hiện có để cập nhật chapter mới.');
  }
  const selected = mode === CRAWL_MODE_NEW_CHAPTERS
    ? selectNewChaptersForImport(parsed.chapters, existingSeries.chapters || [])
    : { chapters: parsed.chapters, skippedExistingChapterCount: 0 };
  const chaptersToImport = maxChapters > 0 ? selected.chapters.slice(0, maxChapters) : selected.chapters;
  const skippedExistingChapterCount = selected.skippedExistingChapterCount;
  await emitProgress({
    phase: 'fetching-chapters',
    message: mode === CRAWL_MODE_NEW_CHAPTERS
      ? `Tìm thấy ${parsed.chapters.length} chapter, bỏ qua ${skippedExistingChapterCount} chapter đã có, sẽ tải ${chaptersToImport.length} chapter mới.`
      : `Tìm thấy ${parsed.chapters.length} chapter, sẽ tải ${chaptersToImport.length} chapter.`,
    mode,
    totalChapters: chaptersToImport.length,
    processedChapters: 0,
    totalImages: 0,
    downloadedImages: 0,
    newChapterCount: 0,
    skippedExistingChapterCount
  });

  if (mode === CRAWL_MODE_NEW_CHAPTERS && chaptersToImport.length === 0) {
    const importSummary = {
      mode,
      newChapterCount: 0,
      skippedExistingChapterCount
    };
    await emitProgress({
      phase: 'completed-no-new-chapters',
      message: 'Chưa có chapter mới.',
      mode,
      totalChapters: 0,
      processedChapters: 0,
      totalImages: 0,
      downloadedImages: 0,
      ...importSummary
    });
    return {
      ...existingSeries,
      importSummary
    };
  }

  const chapters = [];
  let totalImages = 0;
  let downloadedImages = 0;
  let coverThumbnail = await createSeriesCoverThumbnailFromUrl({
    id,
    sourceUrl: parsed.coverUrl,
    refererUrl: seriesUrl,
    rateLimiter,
    config: thumbnailConfig,
    emitProgress,
    errors,
    mode
  });
  let fallbackCoverImagePath = '';
  const chapterStatus = resolveImportedChapterStatus({
    mode,
    publishNewChapters: Boolean(options.publishNewChapters),
    existingSeries
  });
  for (let chapterIndex = 0; chapterIndex < chaptersToImport.length; chapterIndex += 1) {
    const chapter = chaptersToImport[chapterIndex];
    await emitProgress({
      phase: 'fetching-chapter',
      message: `Đang lấy ${chapter.label} (${chapterIndex + 1}/${chaptersToImport.length})...`,
      mode,
      currentChapterLabel: chapter.label,
      processedChapters: chapterIndex
    });
    const chapterHtml = await fetchHtmlWithLimit(adapter, chapter.url, rateLimiter);
    const imageUrls = adapter.extractChapterImages(chapterHtml, chapter.url);
    const selectedImages = maxPages > 0 ? imageUrls.slice(0, maxPages) : imageUrls;
    totalImages += selectedImages.length;
    await emitProgress({
      phase: 'downloading-images',
      message: `${chapter.label}: tìm thấy ${selectedImages.length} ảnh, đang tải...`,
      mode,
      currentChapterLabel: chapter.label,
      totalImages,
      downloadedImages
    });
    const dir = await chapterDir(id, chapter.id);
    const pages = [];

    for (let index = 0; index < selectedImages.length; index += 1) {
      const sourceUrl = selectedImages[index];
      const filename = adapter.filenameForImage(sourceUrl, index);
      let storedImage = await findExistingStoredImage(dir, filename, imageOptimizeConfig);
      if (!storedImage.existed) {
        await retryOperation(
          async () => {
            await rateLimiter.wait(sourceUrl);
            const buffer = await fetchImageBuffer(sourceUrl, chapter.url);
            storedImage = await writeImageWithOptimization({
              buffer,
              dir,
              filename,
              config: imageOptimizeConfig
            });
          },
          {
            retries: imageRetries,
            delayMs: Number(process.env.CRAWL_IMAGE_RETRY_DELAY_MS || 500),
            onRetry: async (event) => {
              const message = `${chapter.label}: retry image ${index + 1}/${selectedImages.length} attempt ${event.attempt} because ${event.error}.`;
              errors.push(message);
              await emitProgress({
                phase: 'retrying-image',
                message,
                mode,
                currentChapterLabel: chapter.label,
                totalImages,
                downloadedImages,
                errors: errors.slice(-20),
                errorCount: errors.length
              });
            }
          }
        );
      }
      downloadedImages += 1;
      if (!fallbackCoverImagePath && storedImage.filePath) fallbackCoverImagePath = storedImage.filePath;
      await emitProgress({
        phase: 'downloading-images',
        message: `${chapter.label}: đã tải ${index + 1}/${selectedImages.length} ảnh.`,
        mode,
        currentChapterLabel: chapter.label,
        totalImages,
        downloadedImages
      });
      pages.push({
        index,
        sourceUrl,
        src: publicImportPath(id, chapter.id, storedImage.filename),
        storageKey: publicImportPath(id, chapter.id, storedImage.filename),
        width: storedImage.width || null,
        height: storedImage.height || null,
        originalBytes: storedImage.originalBytes || null,
        storedBytes: storedImage.storedBytes || null,
        optimized: Boolean(storedImage.optimized)
      });
    }

    chapters.push({
      ...chapter,
      sourceUrl: chapter.url,
      status: chapterStatus,
      pages,
      pageCount: pages.length,
      imported: pages.length > 0
    });
    await emitProgress({
      phase: 'chapter-completed',
      message: `Hoàn tất ${chapter.label}.`,
      mode,
      currentChapterLabel: chapter.label,
      processedChapters: chapterIndex + 1,
      totalImages,
      downloadedImages,
      newChapterCount: chapters.length,
      skippedExistingChapterCount
    });
  }

  const untouchedChapters = mode === CRAWL_MODE_NEW_CHAPTERS
    ? []
    : parsed.chapters.slice(chaptersToImport.length).map((chapter) => ({
      ...chapter,
      sourceUrl: chapter.url,
      status: 'draft',
      pages: [],
      pageCount: 0,
      imported: false
    }));
  const importedPageCount = chapters.reduce((sum, chapter) => sum + chapter.pageCount, 0);
  if (importedPageCount === 0) {
    throw new Error('Không tìm thấy ảnh truyện trong các chapter đã tải. Nguồn có thể chặn crawler hoặc ảnh được nạp bằng cơ chế riêng.');
  }

  if (!coverThumbnail && fallbackCoverImagePath) {
    coverThumbnail = await createSeriesCoverThumbnailFromFile({
      id,
      filePath: fallbackCoverImagePath,
      config: thumbnailConfig,
      emitProgress,
      errors,
      mode
    });
  }

  const importSummary = {
    mode,
    newChapterCount: mode === CRAWL_MODE_NEW_CHAPTERS ? chapters.length : 0,
    skippedExistingChapterCount
  };
  const updated = await upsertSeries(mode === CRAWL_MODE_NEW_CHAPTERS ? {
    id,
    title: existingSeries.title || parsed.title,
    slug: existingSeries.slug || slugify(existingSeries.title || parsed.title),
    sourceUrl: existingSeries.sourceUrl || seriesUrl,
    sourceMappings: existingSeries.sourceMappings || [{ adapter: adapter.name, sourceUrl: seriesUrl }],
    adapter: existingSeries.adapter || adapter.name,
    coverUrl: existingSeries.coverUrl || parsed.coverUrl,
    thumbnailUrl: coverThumbnail?.thumbnailUrl || existingSeries.thumbnailUrl || existingSeries.coverThumbnailUrl || '',
    coverThumbnail: coverThumbnail?.metadata || existingSeries.coverThumbnail || null,
    description: existingSeries.description || '',
    aliases: existingSeries.aliases || [],
    tags: existingSeries.tags || [],
    stats: existingSeries.stats || {},
    crawlSchedule: existingSeries.crawlSchedule || { enabled: false, intervalHours: 24 },
    status: existingSeries.status || 'draft',
    chapters
  } : {
    id,
    title: parsed.title,
    slug: slugify(parsed.title),
    sourceUrl: seriesUrl,
    adapter: adapter.name,
    coverUrl: parsed.coverUrl,
    thumbnailUrl: coverThumbnail?.thumbnailUrl || '',
    coverThumbnail: coverThumbnail?.metadata || null,
    status: 'draft',
    chapters: [...chapters, ...untouchedChapters]
  });
  return {
    ...updated,
    importSummary
  };
}

function hashCode(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

async function createSeriesCoverThumbnailFromUrl({
  id,
  sourceUrl,
  refererUrl,
  rateLimiter,
  config,
  emitProgress,
  errors,
  mode
} = {}) {
  if (!sourceUrl || !config?.enabled) return null;
  try {
    await emitProgress({
      phase: 'fetching-cover',
      message: 'Dang tao thumbnail cover...',
      mode
    });
    await rateLimiter.wait(sourceUrl);
    const buffer = await fetchImageBuffer(sourceUrl, refererUrl);
    return writeSeriesCoverThumbnail({
      id,
      buffer,
      config,
      sourceUrl,
      sourceType: 'source-cover'
    });
  } catch (error) {
    errors.push(`Cover thumbnail failed: ${error.message || error}`);
    await emitProgress({
      phase: 'cover-thumbnail-skipped',
      message: 'Khong tao duoc thumbnail cover tu nguon, se dung anh dau tien neu co.',
      mode,
      errors: errors.slice(-20),
      errorCount: errors.length
    });
    return null;
  }
}

async function createSeriesCoverThumbnailFromFile({
  id,
  filePath,
  config,
  emitProgress,
  errors,
  mode
} = {}) {
  if (!filePath || !config?.enabled) return null;
  try {
    await emitProgress({
      phase: 'creating-cover-thumbnail',
      message: 'Dang tao thumbnail cover tu anh dau tien...',
      mode
    });
    const buffer = await fs.readFile(filePath);
    return writeSeriesCoverThumbnail({
      id,
      buffer,
      config,
      sourceUrl: '',
      sourceType: 'first-page'
    });
  } catch (error) {
    errors.push(`Fallback cover thumbnail failed: ${error.message || error}`);
    await emitProgress({
      phase: 'cover-thumbnail-skipped',
      message: 'Khong tao duoc thumbnail cover.',
      mode,
      errors: errors.slice(-20),
      errorCount: errors.length
    });
    return null;
  }
}

async function writeSeriesCoverThumbnail({
  id,
  buffer,
  config,
  sourceUrl = '',
  sourceType = ''
} = {}) {
  const coverChapterId = '_cover';
  const dir = await chapterDir(id, coverChapterId);
  const thumbnail = await writeCoverThumbnail({
    buffer,
    dir,
    filename: 'cover',
    config
  });
  if (!thumbnail) return null;
  return {
    thumbnailUrl: publicImportPath(id, coverChapterId, thumbnail.filename),
    metadata: {
      sourceUrl,
      sourceType,
      width: thumbnail.width || null,
      height: thumbnail.height || null,
      sourceBytes: thumbnail.sourceBytes || null,
      storedBytes: thumbnail.storedBytes || null,
      format: thumbnail.format || ''
    }
  };
}

async function main() {
  const args = process.argv.slice(2);
  const getArg = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : '';
  };
  const url = getArg('--url');
  if (!url) throw new Error('Missing --url');
  const series = await importSeries(url, {
    maxChapters: Number(getArg('--max-chapters') || 0),
    maxPages: Number(getArg('--max-pages') || 0)
  });
  console.log(JSON.stringify({
    id: series.id,
    title: series.title,
    importedChapters: series.chapters.filter((chapter) => chapter.imported).length,
    importedPages: series.chapters.reduce((sum, chapter) => sum + chapter.pageCount, 0)
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
