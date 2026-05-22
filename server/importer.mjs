import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { chapterDir, publicImportPath, upsertSeries } from './catalogStore.mjs';
import { getAdapterForUrl } from './adapters/index.mjs';
import { slugify } from './utils.mjs';

async function downloadImage(url, destination, refererUrl) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 ComicReaderPrototype/0.1',
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      referer: refererUrl || new URL(url).origin
    }
  });
  if (!response.ok) throw new Error(`Image fetch failed ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destination, buffer);
}

export async function importSeries(seriesUrl, options = {}, onProgress = () => {}) {
  const adapter = getAdapterForUrl(seriesUrl);
  const maxChapters = Number(options.maxChapters || 0);
  const maxPages = Number(options.maxPages || 0);
  onProgress({
    phase: 'fetching-series',
    message: 'Đang lấy metadata và danh sách chapter...'
  });
  const html = await adapter.fetchHtml(seriesUrl);
  const parsed = adapter.parseSeriesPage(html, seriesUrl);
  if (!parsed.chapters.length) {
    throw new Error('Không tìm thấy danh sách chapter hợp lệ trong trang truyện.');
  }
  const id = `${parsed.slug}-${Math.abs(hashCode(seriesUrl)).toString(36)}`;
  const chaptersToImport = maxChapters > 0 ? parsed.chapters.slice(0, maxChapters) : parsed.chapters;
  onProgress({
    phase: 'fetching-chapters',
    message: `Tìm thấy ${parsed.chapters.length} chapter, sẽ tải ${chaptersToImport.length} chapter.`,
    totalChapters: chaptersToImport.length,
    processedChapters: 0,
    totalImages: 0,
    downloadedImages: 0
  });

  const chapters = [];
  let totalImages = 0;
  let downloadedImages = 0;
  for (let chapterIndex = 0; chapterIndex < chaptersToImport.length; chapterIndex += 1) {
    const chapter = chaptersToImport[chapterIndex];
    onProgress({
      phase: 'fetching-chapter',
      message: `Đang lấy ${chapter.label} (${chapterIndex + 1}/${chaptersToImport.length})...`,
      currentChapterLabel: chapter.label,
      processedChapters: chapterIndex
    });
    const chapterHtml = await adapter.fetchHtml(chapter.url);
    const imageUrls = adapter.extractChapterImages(chapterHtml, chapter.url);
    const selectedImages = maxPages > 0 ? imageUrls.slice(0, maxPages) : imageUrls;
    totalImages += selectedImages.length;
    onProgress({
      phase: 'downloading-images',
      message: `${chapter.label}: tìm thấy ${selectedImages.length} ảnh, đang tải...`,
      currentChapterLabel: chapter.label,
      totalImages,
      downloadedImages
    });
    const dir = await chapterDir(id, chapter.id);
    const pages = [];

    for (let index = 0; index < selectedImages.length; index += 1) {
      const sourceUrl = selectedImages[index];
      const filename = adapter.filenameForImage(sourceUrl, index);
      const filePath = path.join(dir, filename);
      try {
        await fs.access(filePath);
      } catch {
        await downloadImage(sourceUrl, filePath, chapter.url);
      }
      downloadedImages += 1;
      onProgress({
        phase: 'downloading-images',
        message: `${chapter.label}: đã tải ${index + 1}/${selectedImages.length} ảnh.`,
        currentChapterLabel: chapter.label,
        totalImages,
        downloadedImages
      });
      pages.push({
        index,
        sourceUrl,
        src: publicImportPath(id, chapter.id, filename)
      });
    }

    chapters.push({
      ...chapter,
      pages,
      pageCount: pages.length,
      imported: pages.length > 0
    });
    onProgress({
      phase: 'chapter-completed',
      message: `Hoàn tất ${chapter.label}.`,
      currentChapterLabel: chapter.label,
      processedChapters: chapterIndex + 1,
      totalImages,
      downloadedImages
    });
  }

  const untouchedChapters = parsed.chapters.slice(chaptersToImport.length).map((chapter) => ({
    ...chapter,
    pages: [],
    pageCount: 0,
    imported: false
  }));
  const importedPageCount = chapters.reduce((sum, chapter) => sum + chapter.pageCount, 0);
  if (importedPageCount === 0) {
    throw new Error('Không tìm thấy ảnh truyện trong các chapter đã tải. Nguồn có thể chặn crawler hoặc ảnh được nạp bằng cơ chế riêng.');
  }

  return upsertSeries({
    id,
    title: parsed.title,
    slug: slugify(parsed.title),
    sourceUrl: seriesUrl,
    adapter: adapter.name,
    coverUrl: parsed.coverUrl,
    chapters: [...chapters, ...untouchedChapters]
  });
}

function hashCode(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
