import './env.mjs';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { chapterDir, publicImportPath } from './catalogStore.mjs';
import { getAdapterForUrl } from './adapters/index.mjs';
import { DomainRateLimiter, retryOperation } from './crawlRuntime.mjs';
import { getSeries, readCatalog, upsertSeries } from './dataStore.mjs';
import {
  coverThumbnailConfig,
  findExistingStoredImage,
  imageOptimizationConfig,
  writeCoverThumbnail,
  writeImageWithOptimization
} from './imageOptimizer.mjs';
import {
  ASSET_MODE_FULL_DOWNLOAD,
  ASSET_MODE_IMAGE_URL,
  IMPORT_MODE_FULL,
  IMPORT_MODE_NEW_CHAPTERS,
  IMPORT_MODE_REFRESH_IMAGE_URLS,
  normalizeAssetMode
} from './importOptions.mjs';
import {
  findExistingSeriesForImport,
  selectNewChaptersForImport,
  selectRefreshImageUrlChapters,
  sourceIdentityKey,
  sourceMappingsWith
} from './importChapterSelection.mjs';
import { slugify } from './utils.mjs';

export {
  findExistingSeriesForImport,
  selectNewChaptersForImport,
  selectRefreshImageUrlChapters,
  sourceIdentityKey,
  sourceMappingsWith
} from './importChapterSelection.mjs';

const ASSET_STATUS_EXTERNAL = 'external';
const ASSET_STATUS_LOCAL = 'local';

export function resolveImportedChapterStatus({
  mode = 'full',
  publishNewChapters = false,
  existingSeries = null
} = {}) {
  void mode;
  void publishNewChapters;
  void existingSeries;
  return 'public';
}

async function fetchImageBuffer(url, refererUrl) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 ComicReaderPrototype/0.1',
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        referer: refererUrl || new URL(url).origin
      }
    });
  } catch (error) {
    throw new Error(`Image fetch failed for ${url}: ${error.message || String(error)}`);
  }
  if (!response.ok) throw new Error(`Image fetch failed ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function fetchHtmlWithLimit(adapter, url, rateLimiter) {
  await rateLimiter.wait(url);
  return adapter.fetchHtml(url);
}

export async function importSeries(seriesUrl, options = {}, onProgress = () => {}) {
  const adapter = getAdapterForUrl(seriesUrl);
  const mode = [IMPORT_MODE_NEW_CHAPTERS, IMPORT_MODE_REFRESH_IMAGE_URLS].includes(options.mode)
    ? options.mode
    : IMPORT_MODE_FULL;
  const assetMode = mode === IMPORT_MODE_REFRESH_IMAGE_URLS ? ASSET_MODE_IMAGE_URL : resolveAssetMode(options.assetMode);
  const shouldDownloadImages = assetMode === ASSET_MODE_FULL_DOWNLOAD;
  const maxChapters = Number(options.maxChapters || 0);
  const maxPages = Number(options.maxPages || 0);
  const imageRetries = clampNumber(options.imageRetries ?? process.env.CRAWL_IMAGE_RETRIES ?? 2, 0, 4);
  const optimizeDuringCrawl = parseBooleanOption(
    options.optimizeDuringCrawl,
    process.env.CRAWL_OPTIMIZE_DURING_CRAWL,
    false
  );
  const imageConcurrency = clampNumber(options.imageConcurrency ?? process.env.CRAWL_IMAGE_CONCURRENCY ?? 6, 1, 8);
  const imageOptimizeConfig = options.imageOptimizeConfig || imageOptimizationConfig();
  const downloadImageConfig = optimizeDuringCrawl ? imageOptimizeConfig : { ...imageOptimizeConfig, enabled: false };
  const thumbnailConfig = options.coverThumbnailConfig || coverThumbnailConfig();
  const allowFirstPageCoverFallback = parseBooleanOption(
    options.allowFirstPageCoverFallback,
    process.env.CRAWL_ALLOW_FIRST_PAGE_COVER_FALLBACK,
    false
  );
  const rateLimiter = options.rateLimiter || new DomainRateLimiter({
    minDelayMs: Number(options.domainDelayMs ?? process.env.CRAWL_DOMAIN_DELAY_MS ?? 650)
  });
  const imageRateLimiter = options.imageRateLimiter || new DomainRateLimiter({
    minDelayMs: Number(options.imageDomainDelayMs ?? process.env.CRAWL_IMAGE_DOMAIN_DELAY_MS ?? 80)
  });
  const errors = [];
  const emitProgress = (patch) => Promise.resolve(onProgress(patch));
  const crawlStartedAt = new Date().toISOString();
  let lastImageProgressAt = 0;
  let skippedExistingImages = 0;
  let failedImages = 0;
  await emitProgress({
    phase: 'fetching-series',
    message: 'Đang lấy metadata và danh sách chapter...',
    startedAt: crawlStartedAt,
    imageConcurrency,
    optimizeDuringCrawl
  });
  const html = await fetchHtmlWithLimit(adapter, seriesUrl, rateLimiter);
  const parsed = adapter.parseSeriesPage(html, seriesUrl);
  if (!parsed.chapters.length) {
    throw new Error('Không tìm thấy danh sách chapter hợp lệ trong trang truyện.');
  }
  const defaultId = `${parsed.slug}-${Math.abs(hashCode(sourceIdentityKey(seriesUrl) || seriesUrl)).toString(36)}`;
  const needsExistingSeries = mode === IMPORT_MODE_NEW_CHAPTERS || mode === IMPORT_MODE_REFRESH_IMAGE_URLS;
  const existingSeries = needsExistingSeries
    ? (options.existingSeries || await getSeries(String(options.seriesId || defaultId), { includePages: true, includeDraft: true }))
    : (options.existingSeries || findExistingSeriesForImport(await readCatalog(), parsed, seriesUrl));
  const id = String(options.seriesId || existingSeries?.id || defaultId);
  if (needsExistingSeries && !existingSeries) {
    throw new Error(mode === IMPORT_MODE_REFRESH_IMAGE_URLS
      ? 'Khong tim thay truyen hien co de refresh URL anh.'
      : 'Không tìm thấy truyện hiện có để cập nhật chapter mới.');
  }
  const selected = mode === IMPORT_MODE_NEW_CHAPTERS
    ? selectNewChaptersForImport(parsed.chapters, existingSeries.chapters || [])
    : mode === IMPORT_MODE_REFRESH_IMAGE_URLS
      ? selectRefreshImageUrlChapters(parsed.chapters, existingSeries.chapters || [])
      : { chapters: parsed.chapters, skippedExistingChapterCount: 0, refreshedExistingChapterCount: 0, newChapterCount: 0 };
  const chaptersToImport = maxChapters > 0 ? selected.chapters.slice(0, maxChapters) : selected.chapters;
  const skippedExistingChapterCount = Number(selected.skippedExistingChapterCount || 0);
  await emitProgress({
    phase: 'fetching-chapters',
    message: mode === IMPORT_MODE_NEW_CHAPTERS
      ? `Tìm thấy ${parsed.chapters.length} chapter, bỏ qua ${skippedExistingChapterCount} chapter đã có, sẽ tải ${chaptersToImport.length} chapter mới.`
      : mode === IMPORT_MODE_REFRESH_IMAGE_URLS
        ? `Tim thay ${parsed.chapters.length} chapter, se refresh URL anh cho ${chaptersToImport.length} chapter.`
      : `Tìm thấy ${parsed.chapters.length} chapter, sẽ tải ${chaptersToImport.length} chapter.`,
    mode,
    totalChapters: chaptersToImport.length,
    processedChapters: 0,
    totalImages: 0,
    downloadedImages: 0,
    skippedExistingImages,
    failedImages,
    processedImages: 0,
    newChapterCount: 0,
    skippedExistingChapterCount,
    imageConcurrency,
    optimizeDuringCrawl,
    startedAt: crawlStartedAt
  });

  if (mode === IMPORT_MODE_NEW_CHAPTERS && chaptersToImport.length === 0) {
    const importSummary = {
      mode,
      assetMode,
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
      skippedExistingImages,
      failedImages,
      processedImages: 0,
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
  const chapterJobs = [];
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
      message: `Đang lấy danh sách ảnh ${chapter.label} (${chapterIndex + 1}/${chaptersToImport.length})...`,
      mode,
      currentChapterLabel: chapter.label,
      fetchedChapters: chapterIndex,
      processedChapters: 0,
      ...progressMetrics({
        startedAt: crawlStartedAt,
        totalImages,
        downloadedImages,
        skippedExistingImages,
        failedImages,
        processedChapters: 0,
        totalChapters: chaptersToImport.length
      })
    });
    const chapterHtml = await fetchHtmlWithLimit(adapter, chapter.url, rateLimiter);
    const imageUrls = adapter.extractChapterImages(chapterHtml, chapter.url);
    const selectedImages = maxPages > 0 ? imageUrls.slice(0, maxPages) : imageUrls;
    const dir = await chapterDir(id, chapter.id);
    totalImages += selectedImages.length;
    chapterJobs.push({
      chapter,
      chapterIndex,
      selectedImages,
      dir
    });
    await emitProgress({
      phase: 'fetching-chapters',
      message: `${chapter.label}: tìm thấy ${selectedImages.length} ảnh.`,
      mode,
      currentChapterLabel: chapter.label,
      fetchedChapters: chapterIndex + 1,
      processedChapters: 0,
      totalImages,
      downloadedImages,
      skippedExistingImages,
      failedImages,
      processedImages: progressMetrics({
        totalImages,
        downloadedImages,
        skippedExistingImages,
        failedImages
      }).processedImages
    });
  }

  for (const chapterJob of chapterJobs) {
    const { chapter, chapterIndex, selectedImages, dir } = chapterJob;
    const pagesByIndex = new Array(selectedImages.length);
    let completedChapterImages = 0;
    await emitProgress({
      phase: 'downloading-images',
      message: `${chapter.label}: đang tải ${selectedImages.length} ảnh với concurrency ${imageConcurrency}.`,
      mode,
      currentChapterLabel: chapter.label,
      processedChapters: chapterIndex,
      totalImages,
      downloadedImages,
      skippedExistingImages,
      failedImages,
      imageConcurrency,
      optimizeDuringCrawl,
      ...progressMetrics({
        startedAt: crawlStartedAt,
        totalImages,
        downloadedImages,
        skippedExistingImages,
        failedImages,
        processedChapters: chapterIndex,
        totalChapters: chapterJobs.length
      })
    });

    if (!shouldDownloadImages) {
      selectedImages.forEach((sourceUrl, index) => {
        pagesByIndex[index] = buildExternalImageUrlPage(sourceUrl, index);
      });
      completedChapterImages = selectedImages.length;
      await emitProgress({
        phase: 'collecting-image-urls',
        message: `${chapter.label}: da luu ${selectedImages.length} URL anh, khong tai file.`,
        mode,
        assetMode,
        currentChapterLabel: chapter.label,
        processedChapters: chapterIndex,
        totalImages,
        downloadedImages,
        skippedExistingImages,
        failedImages,
        imageConcurrency: 0,
        optimizeDuringCrawl: false,
        ...progressMetrics({
          startedAt: crawlStartedAt,
          totalImages,
          downloadedImages,
          skippedExistingImages,
          failedImages,
          processedChapters: chapterIndex,
          totalChapters: chapterJobs.length
        })
      });
    } else {
    await runWithConcurrency(selectedImages, imageConcurrency, async (sourceUrl, index) => {
      const filename = adapter.filenameForImage(sourceUrl, index);
      let storedImage = await findExistingStoredImage(dir, filename, imageOptimizeConfig);
      if (!storedImage.existed) {
        try {
          await retryOperation(
            async () => {
              await imageRateLimiter.wait(sourceUrl);
              const buffer = await fetchImageBuffer(sourceUrl, chapter.url);
              storedImage = await writeImageWithOptimization({
                buffer,
                dir,
                filename,
                config: downloadImageConfig
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
                  skippedExistingImages,
                  failedImages,
                  processedImages: progressMetrics({
                    totalImages,
                    downloadedImages,
                    skippedExistingImages,
                    failedImages
                  }).processedImages,
                  errors: errors.slice(-20),
                  errorCount: errors.length
                });
              }
            }
          );
        } catch (error) {
          failedImages += 1;
          completedChapterImages += 1;
          const message = `${chapter.label}: skipped image ${index + 1}/${selectedImages.length} after retries because ${error.message || String(error)}.`;
          errors.push(message);
          await emitProgress({
            phase: 'skipping-image',
            message,
            mode,
            currentChapterLabel: chapter.label,
            totalImages,
            downloadedImages,
            skippedExistingImages,
            failedImages,
            ...progressMetrics({
              startedAt: crawlStartedAt,
              totalImages,
              downloadedImages,
              skippedExistingImages,
              failedImages,
              processedChapters: chapterIndex,
              totalChapters: chapterJobs.length
            }),
            errors: errors.slice(-20),
            errorCount: errors.length
          });
          return;
        }
      } else {
        skippedExistingImages += 1;
      }
      if (!storedImage.existed) downloadedImages += 1;
      completedChapterImages += 1;
      if (!fallbackCoverImagePath && storedImage.filePath) fallbackCoverImagePath = storedImage.filePath;
      const now = Date.now();
      const shouldEmitImageProgress = now - lastImageProgressAt > 1200 || completedChapterImages === selectedImages.length;
      if (shouldEmitImageProgress) {
        lastImageProgressAt = now;
        await emitProgress({
        phase: 'downloading-images',
        message: `${chapter.label}: đã xử lý ${completedChapterImages}/${selectedImages.length} ảnh.`,
        mode,
        currentChapterLabel: chapter.label,
        totalImages,
        downloadedImages,
        skippedExistingImages,
        failedImages,
        imageConcurrency,
        optimizeDuringCrawl,
        ...progressMetrics({
          startedAt: crawlStartedAt,
          totalImages,
          downloadedImages,
          skippedExistingImages,
          failedImages,
          processedChapters: chapterIndex,
          totalChapters: chapterJobs.length
        })
        });
      }
      pagesByIndex[index] = {
        index,
        sourceUrl,
        src: publicImportPath(id, chapter.id, storedImage.filename),
        imageUrl: publicImportPath(id, chapter.id, storedImage.filename),
        storageKey: publicImportPath(id, chapter.id, storedImage.filename),
        width: storedImage.width || null,
        height: storedImage.height || null,
        originalBytes: storedImage.originalBytes || null,
        storedBytes: storedImage.storedBytes || null,
        optimized: Boolean(storedImage.optimized),
        assetStatus: ASSET_STATUS_LOCAL
      };
    });
    }

    const pages = pagesByIndex.filter(Boolean);
    chapters.push({
      ...chapter,
      sourceUrl: chapter.url,
      status: chapterStatus,
      pages,
      pageCount: pages.length,
      imported: pages.length > 0,
      importMode: assetMode,
      assetStatus: assetStatusForPages(pages)
    });
    await emitProgress({
      phase: 'chapter-completed',
      message: `Hoàn tất ${chapter.label}.`,
      mode,
      currentChapterLabel: chapter.label,
      processedChapters: chapterIndex + 1,
      totalImages,
      downloadedImages,
      skippedExistingImages,
      failedImages,
      imageConcurrency,
      optimizeDuringCrawl,
      ...progressMetrics({
        startedAt: crawlStartedAt,
        totalImages,
        downloadedImages,
        skippedExistingImages,
        failedImages,
        processedChapters: chapterIndex + 1,
        totalChapters: chapterJobs.length
      }),
      newChapterCount: chapters.length,
      skippedExistingChapterCount
    });
  }

  const untouchedChapters = needsExistingSeries
    ? []
    : parsed.chapters.slice(chaptersToImport.length).map((chapter) => ({
      ...chapter,
      sourceUrl: chapter.url,
      status: 'draft',
      pages: [],
      pageCount: 0,
      imported: false,
      importMode: assetMode,
      assetStatus: assetMode === ASSET_MODE_IMAGE_URL ? ASSET_STATUS_EXTERNAL : ASSET_STATUS_LOCAL
    }));
  const importedPageCount = chapters.reduce((sum, chapter) => sum + chapter.pageCount, 0);
  if (importedPageCount === 0) {
    throw new Error('Không tìm thấy ảnh truyện trong các chapter đã tải. Nguồn có thể chặn crawler hoặc ảnh được nạp bằng cơ chế riêng.');
  }

  if (!coverThumbnail && fallbackCoverImagePath && allowFirstPageCoverFallback) {
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
    assetMode,
    newChapterCount: mode === IMPORT_MODE_NEW_CHAPTERS ? chapters.length : Number(selected.newChapterCount || 0),
    skippedExistingChapterCount,
    refreshedExistingChapterCount: mode === IMPORT_MODE_REFRESH_IMAGE_URLS ? Number(selected.refreshedExistingChapterCount || 0) : 0
  };
  const nextChaptersForStatus = needsExistingSeries
    ? [...chapters, ...(existingSeries?.chapters || [])]
    : [...chapters, ...untouchedChapters];
  const updated = await upsertSeries(needsExistingSeries ? {
    id,
    title: existingSeries.title || parsed.title,
    slug: existingSeries.slug || slugify(existingSeries.title || parsed.title),
    sourceUrl: existingSeries.sourceUrl || seriesUrl,
    sourceMappings: sourceMappingsWith(existingSeries, adapter.name, seriesUrl),
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
    importMode: assetMode,
    assetStatus: assetStatusForChapters(nextChaptersForStatus),
    chapters
  } : {
    id,
    title: parsed.title,
    slug: slugify(parsed.title),
    sourceUrl: seriesUrl,
    sourceMappings: sourceMappingsWith({}, adapter.name, seriesUrl),
    adapter: adapter.name,
    coverUrl: parsed.coverUrl,
    thumbnailUrl: coverThumbnail?.thumbnailUrl || '',
    coverThumbnail: coverThumbnail?.metadata || null,
    status: 'public',
    importMode: assetMode,
    assetStatus: assetStatusForChapters(nextChaptersForStatus),
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

export function resolveAssetMode(value) {
  return normalizeAssetMode(value);
}

export function buildExternalImageUrlPage(sourceUrl, index) {
  const imageUrl = String(sourceUrl || '').trim();
  return {
    index,
    sourceUrl: imageUrl,
    src: imageUrl,
    imageUrl,
    storageKey: '',
    width: null,
    height: null,
    assetStatus: ASSET_STATUS_EXTERNAL
  };
}

function assetStatusForPages(pages = []) {
  const statuses = new Set(pages.map((page) => page.assetStatus || '').filter(Boolean));
  if (statuses.size === 1) return [...statuses][0];
  if (statuses.size > 1) return 'mixed';
  return ASSET_STATUS_EXTERNAL;
}

function assetStatusForChapters(chapters = []) {
  const statuses = new Set(chapters.map((chapter) => chapter.assetStatus || '').filter(Boolean));
  if (statuses.size === 1) return [...statuses][0];
  if (statuses.size > 1) return 'mixed';
  return ASSET_STATUS_EXTERNAL;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function parseBooleanOption(value, envValue, defaultValue = false) {
  const selected = value ?? envValue;
  if (selected === undefined || selected === null || selected === '') return defaultValue;
  if (typeof selected === 'boolean') return selected;
  return ['1', 'true', 'yes', 'on'].includes(String(selected).trim().toLowerCase());
}

async function runWithConcurrency(items, limit, worker) {
  const queue = Array.isArray(items) ? items : [];
  const workerCount = Math.min(Math.max(1, Number(limit || 1)), Math.max(1, queue.length));
  let nextIndex = 0;
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < queue.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(queue[currentIndex], currentIndex);
    }
  }));
}

export function progressMetrics({
  startedAt = '',
  totalImages = 0,
  downloadedImages = 0,
  skippedExistingImages = 0,
  failedImages = 0,
  processedChapters = 0,
  totalChapters = 0
} = {}) {
  const usableImages = Number(downloadedImages || 0) + Number(skippedExistingImages || 0);
  const processedImages = usableImages + Number(failedImages || 0);
  const elapsedMs = Math.max(1, Date.now() - (Date.parse(startedAt) || Date.now()));
  const elapsedMinutes = elapsedMs / 60_000;
  const imagesPerMinute = elapsedMinutes > 0 ? Math.round((processedImages / elapsedMinutes) * 10) / 10 : 0;
  const chaptersPerMinute = elapsedMinutes > 0 ? Math.round((Number(processedChapters || 0) / elapsedMinutes) * 10) / 10 : 0;
  const remainingImages = Math.max(0, Number(totalImages || 0) - processedImages);
  const etaSeconds = imagesPerMinute > 0 ? Math.round((remainingImages / imagesPerMinute) * 60) : null;
  return {
    processedImages,
    usableImages,
    downloadedImages: Number(downloadedImages || 0),
    skippedExistingImages: Number(skippedExistingImages || 0),
    failedImages: Number(failedImages || 0),
    imagesPerMinute,
    chaptersPerMinute,
    etaSeconds,
    totalChapters
  };
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
