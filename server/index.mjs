import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getSeries, IMPORT_ROOT, readCatalog } from './catalogStore.mjs';
import { appendAnalyticsEvent } from './analyticsStore.mjs';
import {
  buildHomeCollections,
  buildTagPage,
  findChapterBySlug,
  findSeriesBySlug,
  readPublicCatalog,
  recordStoredEvent,
  searchCatalog,
  setStoredCrawlSchedule,
  updateStoredSeries
} from './contentStore.mjs';
import { createImportJob, getImportJob, getRunningImportJobForUrl } from './importJobs.mjs';
import { normalizeImportPayload } from './importOptions.mjs';
import { jsonResponse, mimeFromPath, readJsonBody } from './utils.mjs';
import {
  absoluteUrl,
  buildRobotsTxt,
  buildSiteMapFromCatalog,
  chapterJsonLd,
  renderHtmlShell,
  seriesJsonLd
} from './seo.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 4173);

function cleanRelativePath(urlPath, prefix = '') {
  const decoded = decodeURIComponent(urlPath.replace(prefix, ''));
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  return normalized.replace(/^[/\\]+/, '');
}

async function sendFile(res, filePath) {
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, {
      'content-type': mimeFromPath(filePath),
      'cache-control': filePath.includes(`${path.sep}imports${path.sep}`) ? 'public, max-age=31536000' : 'no-cache'
    });
    res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    throw error;
  }
}

function textResponse(res, status, body, contentType) {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-cache'
  });
  res.end(body);
}

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return (process.env.PUBLIC_SITE_URL || `${proto}://${host}`).replace(/\/$/, '');
}

function startImportJob(payload) {
  const runningJob = getRunningImportJobForUrl(payload.url);
  if (runningJob) return { job: runningJob, reused: true, status: 200 };
  const job = createImportJob(payload);
  job.done.catch(() => {});
  return { job: getImportJob(job.id), reused: false, status: 202 };
}

function importErrorPayload(error) {
  const message = error.message?.startsWith('Source returned')
    ? 'Nguồn đang trả trang lỗi hoặc chặn crawler, chưa thể lấy ảnh truyện lúc này.'
    : error.message;
  return {
    error: message || 'Không thể import truyện.',
    hint: 'Nguồn có thể chặn crawler hoặc cấu trúc trang đã thay đổi.'
  };
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/series') {
    jsonResponse(res, 200, await readPublicCatalog());
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/public/home') {
    jsonResponse(res, 200, buildHomeCollections(await readCatalog()));
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/search') {
    jsonResponse(res, 200, { series: searchCatalog(await readCatalog(), url.searchParams.get('q') || '') });
    return true;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/tags/')) {
    const tagSlug = decodeURIComponent(url.pathname.replace('/api/tags/', ''));
    const page = buildTagPage(await readCatalog(), tagSlug);
    jsonResponse(res, page ? 200 : 404, page || { error: 'Tag not found' });
    return true;
  }

  if (req.method === 'GET' && url.pathname.match(/^\/api\/series\/[^/]+\/chapters\/[^/]+$/)) {
    const [, , , seriesSlug, , chapterSlug] = url.pathname.split('/');
    const series = findSeriesBySlug(await readCatalog(), decodeURIComponent(seriesSlug));
    const chapter = findChapterBySlug(series, decodeURIComponent(chapterSlug));
    jsonResponse(res, series && chapter ? 200 : 404, series && chapter ? { series, chapter } : { error: 'Chapter not found' });
    return true;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/series/')) {
    const id = decodeURIComponent(url.pathname.replace('/api/series/', ''));
    const catalog = await readCatalog();
    const series = findSeriesBySlug(catalog, id) || await getSeries(id);
    jsonResponse(res, series ? 200 : 404, series || { error: 'Series not found' });
    return true;
  }

  if (req.method === 'PATCH' && url.pathname.startsWith('/api/admin/series/')) {
    const id = decodeURIComponent(url.pathname.replace('/api/admin/series/', ''));
    const result = await updateStoredSeries(id, await readJsonBody(req));
    jsonResponse(res, result.series ? 200 : 404, result.series || { error: 'Series not found' });
    return true;
  }

  if (req.method === 'POST' && url.pathname.match(/^\/api\/admin\/series\/[^/]+\/crawl-schedule$/)) {
    const id = decodeURIComponent(url.pathname.split('/')[4]);
    const result = await setStoredCrawlSchedule(id, await readJsonBody(req));
    jsonResponse(res, result.series ? 200 : 404, result.series || { error: 'Series not found' });
    return true;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/import/')) {
    const id = decodeURIComponent(url.pathname.replace('/api/import/', ''));
    const job = getImportJob(id);
    jsonResponse(res, job ? 200 : 404, job || { error: 'Import job not found' });
    return true;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/admin/import-jobs/')) {
    const id = decodeURIComponent(url.pathname.replace('/api/admin/import-jobs/', ''));
    const job = getImportJob(id);
    jsonResponse(res, job ? 200 : 404, job || { error: 'Import job not found' });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/import') {
    try {
      const body = await readJsonBody(req);
      if (!body.url || !/^https?:\/\//i.test(body.url)) {
        jsonResponse(res, 400, { error: 'Vui lòng nhập URL truyện hợp lệ.' });
        return true;
      }
      const result = startImportJob(normalizeImportPayload(body));
      jsonResponse(res, result.status, { job: result.job, reused: result.reused });
    } catch (error) {
      jsonResponse(res, 500, importErrorPayload(error));
    }
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/import-jobs') {
    try {
      const body = await readJsonBody(req);
      if (!body.url || !/^https?:\/\//i.test(body.url)) {
        jsonResponse(res, 400, { error: 'Vui lòng nhập URL truyện hợp lệ.' });
        return true;
      }
      const result = startImportJob(normalizeImportPayload(body));
      jsonResponse(res, result.status, { job: result.job, reused: result.reused });
    } catch (error) {
      jsonResponse(res, 500, importErrorPayload(error));
    }
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/events') {
    const event = await appendAnalyticsEvent(await readJsonBody(req));
    const result = event.seriesSlug ? await recordStoredEvent(event) : { series: null };
    jsonResponse(res, 202, { ok: true, stats: result.series?.stats || null });
    return true;
  }

  return false;
}

async function handleSeoRoute(req, res, url) {
  const baseUrl = getBaseUrl(req);
  if (url.pathname === '/robots.txt') {
    textResponse(res, 200, buildRobotsTxt(baseUrl), 'text/plain; charset=utf-8');
    return true;
  }
  if (url.pathname === '/sitemap.xml') {
    textResponse(res, 200, buildSiteMapFromCatalog(await readCatalog(), baseUrl), 'application/xml; charset=utf-8');
    return true;
  }

  const seriesMatch = url.pathname.match(/^\/truyen\/([^/]+)$/);
  if (seriesMatch) {
    const series = findSeriesBySlug(await readCatalog(), decodeURIComponent(seriesMatch[1]));
    if (!series) return false;
    textResponse(res, 200, renderHtmlShell({
      title: `${series.title} - đọc truyện tranh`,
      description: series.description || `Đọc ${series.title} liên tục, mượt và lưu vị trí đọc.`,
      canonicalUrl: `${baseUrl}/truyen/${series.slug}`,
      imageUrl: absoluteUrl(series.coverUrl, baseUrl),
      jsonLd: seriesJsonLd(series, baseUrl)
    }), 'text/html; charset=utf-8');
    return true;
  }

  const chapterMatch = url.pathname.match(/^\/truyen\/([^/]+)\/([^/]+)$/);
  if (chapterMatch) {
    const series = findSeriesBySlug(await readCatalog(), decodeURIComponent(chapterMatch[1]));
    const chapter = findChapterBySlug(series, decodeURIComponent(chapterMatch[2]));
    if (!series || !chapter) return false;
    textResponse(res, 200, renderHtmlShell({
      title: `${series.title} - ${chapter.title}`,
      description: `Đọc ${series.title} ${chapter.title} với reader nối chapter và lưu vị trí.`,
      canonicalUrl: `${baseUrl}/truyen/${series.slug}/${chapter.slug}`,
      imageUrl: absoluteUrl(chapter.pages?.[0]?.imageUrl || series.coverUrl, baseUrl),
      jsonLd: chapterJsonLd(series, chapter, baseUrl)
    }), 'text/html; charset=utf-8');
    return true;
  }

  const tagMatch = url.pathname.match(/^\/the-loai\/([^/]+)$/);
  if (tagMatch) {
    const page = buildTagPage(await readCatalog(), decodeURIComponent(tagMatch[1]));
    if (!page) return false;
    textResponse(res, 200, renderHtmlShell({
      title: `Truyện ${page.tag.name}`,
      description: `Danh sách truyện tranh thể loại ${page.tag.name}, cập nhật mới và đọc liên tục.`,
      canonicalUrl: `${baseUrl}/the-loai/${page.tag.slug}`
    }), 'text/html; charset=utf-8');
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (await handleApi(req, res, url)) return;
    if (await handleSeoRoute(req, res, url)) return;

    if (url.pathname.startsWith('/imports/')) {
      const rel = cleanRelativePath(url.pathname, '/imports/');
      await sendFile(res, path.join(IMPORT_ROOT, rel));
      return;
    }

    const rel = cleanRelativePath(url.pathname === '/' ? '/index.html' : url.pathname);
    const filePath = path.join(PUBLIC_DIR, rel);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    await sendFile(res, filePath);
  } catch (error) {
    console.error(error);
    jsonResponse(res, 500, { error: 'Server error', detail: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Comic reader running at http://localhost:${PORT}`);
});
