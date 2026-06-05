import './env.mjs';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { IMPORT_ROOT } from './catalogStore.mjs';
import { createBoundedCache } from './cacheStore.mjs';
import { ensureStorageSchema, getSeries, readCatalog, usesPostgresStorage } from './dataStore.mjs';
import { appendAnalyticsEvent } from './analyticsStore.mjs';
import { adminConfigStatus, createAdminSession, isAdminAuthorized, isAdminPath } from './adminAuth.mjs';
import {
  extractUserToken,
  getSessionUser,
  loginUser,
  logoutUser,
  registerUser
} from './userStore.mjs';
import {
  handleGoogleCallback,
  handleGoogleStart
} from './googleAuthApi.mjs';
import {
  createAdminBulletinMessage,
  createUserBulletinMessage,
  listBulletinMessages,
  setAdminBulletinPinned
} from './bulletinStore.mjs';
import {
  buildReaderChapterPayload,
  buildHomeCollections,
  buildTagPage,
  findChapterBySlug,
  findSeriesBySlug,
  publicSeriesDetail,
  readAdminCatalog,
  readPublicCatalog,
  recordStoredEvent,
  searchCatalog,
  setStoredCrawlSchedule,
  updateStoredChapter,
  updateStoredSeries
} from './contentStore.mjs';
import {
  createImportJob,
  createImportJobs,
  ensureCrawlQueueStorage,
  getImportJob,
  listImportJobs,
  resetStaleRunningImportJobs
} from './importJobs.mjs';
import {
  createProductionPublishJob,
  getProductionPublishJob
} from './productionPublishJobs.mjs';
import { runWorkerOnce } from './crawlWorker.mjs';
import { normalizeImportBatchPayload, normalizeImportPayload } from './importOptions.mjs';
import { createUpdateChaptersPayload, sourceUrlForSeries } from './crawlQueue.mjs';
import { checkApiRateLimit } from './rateLimit.mjs';
import { corsHeaders, jsonResponse, mimeFromPath, readJsonBody } from './utils.mjs';
import {
  absoluteUrl,
  buildRobotsTxt,
  buildSiteMapFromCatalog,
  chapterJsonLd,
  renderNotFoundShell,
  renderHtmlShell,
  renderStaticPageShell,
  seriesJsonLd
} from './seo.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 4173);
const S3_SYNC_STATUS_FILE = path.resolve(process.env.S3_SYNC_STATUS_FILE || process.env.VIETNIX_S3_SYNC_STATUS_FILE || path.join(ROOT, '.runtime', 's3-sync-status.json'));
const API_CACHE_TTL_MS = 15_000;
const apiResponseCache = createBoundedCache({ maxEntries: Number(process.env.API_CACHE_MAX_ENTRIES || 250) });
const SPA_ROUTE_PATHS = new Set(['/admin']);
const EMBEDDED_CRAWL_WORKER_ENABLED = process.env.CRAWL_EMBEDDED_WORKER !== 'false';
const EMBEDDED_CRAWL_WORKER_ID = `server-crawl-worker-${process.pid}`;
const EMBEDDED_CRAWL_DRAIN_LIMIT = Math.max(1, Number(process.env.CRAWL_EMBEDDED_DRAIN_LIMIT || 50));
let embeddedCrawlDrainPromise = null;
let embeddedCrawlDrainRequested = false;

function cleanRelativePath(urlPath, prefix = '') {
  const decoded = decodeURIComponent(urlPath.replace(prefix, ''));
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  return normalized.replace(/^[/\\]+/, '');
}

async function sendFile(res, filePath) {
  try {
    const stat = await fs.stat(filePath);
    res.writeHead(200, {
      ...corsHeaders(),
      'content-type': mimeFromPath(filePath),
      'content-length': stat.size,
      'cache-control': filePath.includes(`${path.sep}imports${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache'
    });
    const stream = createReadStream(filePath);
    stream.on('error', (error) => {
      console.error(error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    stream.pipe(res);
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
    ...corsHeaders(),
    'content-type': contentType,
    'cache-control': 'no-cache'
  });
  res.end(body);
}

async function cachedJsonResponse(req, res, key, producer, ttlMs = API_CACHE_TTL_MS) {
  const now = Date.now();
  const cached = apiResponseCache.get(key);
  if (cached && cached.expiresAt > now) {
    res.writeHead(cached.status, {
      ...corsHeaders(),
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-local-cache': 'hit'
    });
    res.end(cached.payload);
    return;
  }
  const { status = 200, body } = await producer();
  const payload = JSON.stringify(body, null, 2);
  apiResponseCache.set(key, {
    status,
    payload,
    expiresAt: now + ttlMs
  });
  res.writeHead(status, {
    ...corsHeaders(),
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-local-cache': 'miss'
  });
  res.end(payload);
}

function clearApiCache() {
  apiResponseCache.clear();
}

function isSpaRoutePath(pathname) {
  return SPA_ROUTE_PATHS.has(pathname) || pathname.startsWith('/admin/series/');
}

function kickEmbeddedCrawlWorker(reason = 'manual') {
  if (!EMBEDDED_CRAWL_WORKER_ENABLED) return;
  embeddedCrawlDrainRequested = true;
  if (embeddedCrawlDrainPromise) return;
  embeddedCrawlDrainPromise = drainEmbeddedCrawlQueue(reason)
    .catch((error) => {
      console.error(`[crawl-worker] embedded runner failed: ${error.message}`);
    })
    .finally(() => {
      embeddedCrawlDrainPromise = null;
      if (embeddedCrawlDrainRequested) kickEmbeddedCrawlWorker('queued-during-run');
    });
}

async function readS3SyncStatus() {
  try {
    const rawStatus = await fs.readFile(S3_SYNC_STATUS_FILE, 'utf8');
    const status = JSON.parse(rawStatus.replace(/^\uFEFF/, ''));
    return {
      status: 'idle',
      ...status,
      exists: true
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        exists: false,
        status: 'idle',
        message: 'Chưa có job đồng bộ S3 nào ghi trạng thái.',
        total: 0,
        checked: 0,
        uploaded: 0,
        skipped: 0,
        cachedSkipped: 0,
        failed: 0,
        percent: 0
      };
    }
    throw error;
  }
}

async function drainEmbeddedCrawlQueue(reason) {
  console.log(`[crawl-worker] embedded drain requested: ${reason}`);
  while (embeddedCrawlDrainRequested) {
    embeddedCrawlDrainRequested = false;
    for (let index = 0; index < EMBEDDED_CRAWL_DRAIN_LIMIT; index += 1) {
      const result = await runWorkerOnce({
        workerId: EMBEDDED_CRAWL_WORKER_ID,
        enqueueSchedules: false
      });
      if (!result.claimed) break;
      clearApiCache();
    }
  }
}

function compactImportJob(job = {}) {
  const payload = job.payload || {};
  return {
    id: job.id,
    status: job.status,
    attempts: job.attempts || 0,
    error: job.error || '',
    createdAt: job.createdAt || '',
    updatedAt: job.updatedAt || '',
    startedAt: job.startedAt || '',
    completedAt: job.completedAt || '',
    lockedBy: job.lockedBy || '',
    progress: job.progress || {},
    payload: {
      url: payload.url || '',
      mode: payload.mode || 'full',
      seriesId: payload.seriesId || '',
      maxChapters: payload.maxChapters,
      maxPages: payload.maxPages,
      publish: payload.publish,
      publishNewChapters: payload.publishNewChapters
    }
  };
}

function summarizeImportJobs(jobs = []) {
  const counts = {
    queued: 0,
    retrying: 0,
    running: 0,
    completed: 0,
    failed: 0
  };
  for (const job of jobs) {
    counts[job.status] = (counts[job.status] || 0) + 1;
  }
  const byStatus = (status, limit) => jobs
    .filter((job) => job.status === status)
    .slice(0, limit)
    .map(compactImportJob);
  return {
    generatedAt: new Date().toISOString(),
    counts,
    running: byStatus('running', 3),
    queued: byStatus('queued', 10),
    retrying: byStatus('retrying', 5),
    failed: byStatus('failed', 5),
    worker: {
      embeddedEnabled: EMBEDDED_CRAWL_WORKER_ENABLED,
      active: Boolean(embeddedCrawlDrainPromise),
      wakeRequested: embeddedCrawlDrainRequested,
      id: EMBEDDED_CRAWL_WORKER_ID,
      drainLimit: EMBEDDED_CRAWL_DRAIN_LIMIT
    }
  };
}

async function buildImportQueueSummary({ wake = false } = {}) {
  const resetCount = await resetStaleRunningImportJobs();
  const jobs = await listImportJobs({ limit: 100 });
  const hasWaitingJobs = jobs.some((job) => job.status === 'queued' || job.status === 'retrying');
  if (wake && hasWaitingJobs) {
    kickEmbeddedCrawlWorker('admin-import-summary');
  }
  return {
    ...summarizeImportJobs(jobs),
    staleResetCount: Number(resetCount || 0)
  };
}

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return (process.env.PUBLIC_SITE_URL || `${proto}://${host}`).replace(/\/$/, '');
}

async function startImportJob(payload) {
  const result = await createImportJob(payload);
  kickEmbeddedCrawlWorker(result.reused ? 'reuse-import-job' : 'new-import-job');
  return {
    job: result.job,
    reused: result.reused,
    status: result.reused ? 200 : 202
  };
}

async function startImportJobs(payloads) {
  const results = await createImportJobs(payloads);
  kickEmbeddedCrawlWorker('batch-import-jobs');
  return results.map((result) => ({
    job: result.job,
    reused: result.reused,
    status: result.reused ? 200 : 202
  }));
}

async function readerCatalogForSeries(seriesSlug) {
  if (!usesPostgresStorage()) return readCatalog();
  const series = await getSeries(decodeURIComponent(seriesSlug), {
    includePages: true,
    includeDraft: false
  });
  return { series: series ? [series] : [] };
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
  const rateLimit = checkApiRateLimit(req, url.pathname);
  if (!rateLimit.allowed) {
    jsonResponse(res, 429, {
      error: 'Too many requests. Please slow down.',
      retryAfterSeconds: rateLimit.retryAfterSeconds
    });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/login') {
    const config = adminConfigStatus();
    if (!config.configured) {
      jsonResponse(res, 503, {
        error: `Admin environment is not configured. Missing: ${config.missing.join(', ')}.`
      });
      return true;
    }
    const session = createAdminSession(await readJsonBody(req));
    jsonResponse(res, session ? 200 : 401, session || { error: 'Email hoặc mật khẩu admin không đúng.' });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/users/register') {
    try {
      jsonResponse(res, 201, await registerUser(await readJsonBody(req)));
    } catch (error) {
      jsonResponse(res, error.status || 500, { error: error.message || 'Register failed' });
    }
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/users/login') {
    try {
      jsonResponse(res, 200, await loginUser(await readJsonBody(req)));
    } catch (error) {
      jsonResponse(res, error.status || 500, { error: error.message || 'Login failed' });
    }
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/users/me') {
    const user = await getSessionUser(extractUserToken(req.headers));
    jsonResponse(res, user ? 200 : 401, user || { error: 'User session is required.' });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/users/logout') {
    jsonResponse(res, 202, await logoutUser(extractUserToken(req.headers)));
    return true;
  }

  if (url.pathname === '/api/auth/google/start') {
    await handleGoogleStart(req, res);
    return true;
  }

  if (url.pathname === '/api/auth/google/callback') {
    await handleGoogleCallback(req, res);
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/bulletin/messages') {
    jsonResponse(res, 200, { messages: await listBulletinMessages({ limit: Number(url.searchParams.get('limit') || 30) }) });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/bulletin/messages') {
    try {
      const user = await getSessionUser(extractUserToken(req.headers));
      if (!user) {
        jsonResponse(res, 401, { error: 'Bạn cần đăng nhập để gửi tin nhắn.' });
        return true;
      }
      const message = await createUserBulletinMessage({
        ...(await readJsonBody(req)),
        user
      });
      jsonResponse(res, 201, { message });
    } catch (error) {
      jsonResponse(res, error.status || 500, { error: error.message || 'Không thể gửi tin nhắn.' });
    }
    return true;
  }

  if (isAdminPath(url.pathname) && !adminConfigStatus().configured) {
    jsonResponse(res, 503, { error: 'Admin environment is not configured.' });
    return true;
  }

  if (isAdminPath(url.pathname) && !isAdminAuthorized(req.headers)) {
    jsonResponse(res, 401, { error: 'Admin token is required.' });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/bulletin/messages') {
    jsonResponse(res, 200, { messages: await listBulletinMessages({ limit: Number(url.searchParams.get('limit') || 60) }) });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/bulletin/messages') {
    try {
      const message = await createAdminBulletinMessage({
        ...(await readJsonBody(req)),
        adminEmail: adminConfigStatus().email
      });
      jsonResponse(res, 201, { message });
    } catch (error) {
      jsonResponse(res, error.status || 500, { error: error.message || 'Không thể gửi tin admin.' });
    }
    return true;
  }

  if (req.method === 'PATCH' && url.pathname.startsWith('/api/admin/bulletin/messages/')) {
    try {
      const id = decodeURIComponent(url.pathname.replace('/api/admin/bulletin/messages/', ''));
      const body = await readJsonBody(req);
      const message = await setAdminBulletinPinned(id, Boolean(body.pinned));
      jsonResponse(res, 200, { message });
    } catch (error) {
      jsonResponse(res, error.status || 500, { error: error.message || 'Không thể cập nhật tin nhắn.' });
    }
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/series') {
    await cachedJsonResponse(req, res, url.pathname, async () => ({ body: await readPublicCatalog() }));
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/series') {
    jsonResponse(res, 200, await readAdminCatalog());
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/s3-sync/status') {
    jsonResponse(res, 200, await readS3SyncStatus());
    return true;
  }

  if (req.method === 'GET' && (url.pathname === '/api/home' || url.pathname === '/api/public/home')) {
    await cachedJsonResponse(req, res, url.pathname, async () => ({ body: buildHomeCollections(await readCatalog({ includePages: false })) }));
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/search') {
    await cachedJsonResponse(req, res, url.pathname + url.search, async () => ({ body: { series: searchCatalog(await readCatalog({ includePages: false }), url.searchParams.get('q') || '') } }));
    return true;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/tags/')) {
    const tagSlug = decodeURIComponent(url.pathname.replace('/api/tags/', ''));
    await cachedJsonResponse(req, res, url.pathname, async () => {
      const page = buildTagPage(await readCatalog({ includePages: false }), tagSlug);
      return { status: page ? 200 : 404, body: page || { error: 'Tag not found' } };
    });
    return true;
  }

  if (req.method === 'GET' && url.pathname.match(/^\/api\/series\/[^/]+\/chapters\/[^/]+$/)) {
    const [, , , seriesSlug, , chapterSlug] = url.pathname.split('/');
    await cachedJsonResponse(req, res, url.pathname + url.search, async () => {
      const payload = buildReaderChapterPayload(await readerCatalogForSeries(seriesSlug), decodeURIComponent(seriesSlug), decodeURIComponent(chapterSlug), {
        window: Number(url.searchParams.get('window') || 0)
      });
      return { status: payload ? 200 : 404, body: payload || { error: 'Chapter not found' } };
    });
    return true;
  }

  if (req.method === 'GET' && url.pathname.match(/^\/api\/series\/[^/]+\/chapters\/[^/]+\/next$/)) {
    const [, , , seriesSlug, , chapterSlug] = url.pathname.split('/');
    await cachedJsonResponse(req, res, url.pathname + url.search, async () => {
      const payload = buildReaderChapterPayload(await readerCatalogForSeries(seriesSlug), decodeURIComponent(seriesSlug), decodeURIComponent(chapterSlug), {
        window: Number(url.searchParams.get('window') || 0),
        start: 'next'
      });
      return { status: payload ? 200 : 404, body: payload || { error: 'Next chapter not found' } };
    });
    return true;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/series/')) {
    const id = decodeURIComponent(url.pathname.replace('/api/series/', ''));
    await cachedJsonResponse(req, res, url.pathname, async () => {
      const catalog = await readCatalog({ includePages: false });
      const series = findSeriesBySlug(catalog, id) || await getSeries(id, { includePages: false });
      return { status: series ? 200 : 404, body: series ? publicSeriesDetail(series) : { error: 'Series not found' } };
    });
    return true;
  }

  if (req.method === 'PATCH' && url.pathname.match(/^\/api\/admin\/series\/[^/]+\/chapters\/[^/]+$/)) {
    const [, , , seriesId, , chapterId] = url.pathname.split('/');
    const result = await updateStoredChapter(decodeURIComponent(seriesId), decodeURIComponent(chapterId), await readJsonBody(req));
    clearApiCache();
    jsonResponse(res, result.chapter ? 200 : 404, result.chapter || { error: 'Chapter not found' });
    return true;
  }

  if (req.method === 'PATCH' && url.pathname.startsWith('/api/admin/series/')) {
    const id = decodeURIComponent(url.pathname.replace('/api/admin/series/', ''));
    const result = await updateStoredSeries(id, await readJsonBody(req));
    clearApiCache();
    jsonResponse(res, result.series ? 200 : 404, result.series || { error: 'Series not found' });
    return true;
  }

  if (req.method === 'POST' && url.pathname.match(/^\/api\/admin\/series\/[^/]+\/crawl-schedule$/)) {
    const id = decodeURIComponent(url.pathname.split('/')[4]);
    const result = await setStoredCrawlSchedule(id, await readJsonBody(req));
    clearApiCache();
    jsonResponse(res, result.series ? 200 : 404, result.series || { error: 'Series not found' });
    return true;
  }

  if (req.method === 'POST' && url.pathname.match(/^\/api\/admin\/series\/[^/]+\/update-chapters$/)) {
    const id = decodeURIComponent(url.pathname.split('/')[4]);
    const catalog = await readCatalog({ includePages: false });
    const series = findSeriesBySlug(catalog, id, { includeDraft: true }) || await getSeries(id, { includePages: false, includeDraft: true });
    if (!series) {
      jsonResponse(res, 404, { error: 'Series not found' });
      return true;
    }
    if (!sourceUrlForSeries(series)) {
      jsonResponse(res, 400, { error: 'Truyện này chưa có source URL để cập nhật chapter mới.' });
      return true;
    }
    const body = await readJsonBody(req);
    const result = await startImportJob(createUpdateChaptersPayload(series, {
      ...body,
      publishNewChapters: true
    }));
    clearApiCache();
    jsonResponse(res, result.status, { job: result.job, reused: result.reused });
    return true;
  }

  if (req.method === 'POST' && url.pathname.match(/^\/api\/admin\/series\/[^/]+\/publish-production$/)) {
    const id = decodeURIComponent(url.pathname.split('/')[4]);
    const catalog = await readCatalog({ includePages: false });
    const series = findSeriesBySlug(catalog, id, { includeDraft: true }) || await getSeries(id, { includePages: false, includeDraft: true });
    if (!series) {
      jsonResponse(res, 404, { error: 'Series not found' });
      return true;
    }
    const result = createProductionPublishJob({
      seriesId: series.id || id,
      seriesSlug: series.slug || '',
      title: series.title || ''
    });
    clearApiCache();
    jsonResponse(res, result.reused ? 200 : 202, result);
    return true;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/admin/production-jobs/')) {
    const id = decodeURIComponent(url.pathname.replace('/api/admin/production-jobs/', ''));
    const job = getProductionPublishJob(id);
    if (job?.status === 'completed') clearApiCache();
    jsonResponse(res, job ? 200 : 404, job || { error: 'Production job not found' });
    return true;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/import/')) {
    const id = decodeURIComponent(url.pathname.replace('/api/import/', ''));
    const job = await getImportJob(id);
    if (job?.status === 'completed') clearApiCache();
    jsonResponse(res, job ? 200 : 404, job || { error: 'Import job not found' });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/import-jobs') {
    jsonResponse(res, 200, { jobs: await listImportJobs({ limit: Number(url.searchParams.get('limit') || 50) }) });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/import-jobs/summary') {
    jsonResponse(res, 200, await buildImportQueueSummary({ wake: true }));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/import-jobs/wake') {
    kickEmbeddedCrawlWorker('admin-wake');
    jsonResponse(res, 200, await buildImportQueueSummary({ wake: true }));
    return true;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/admin/import-jobs/')) {
    const id = decodeURIComponent(url.pathname.replace('/api/admin/import-jobs/', ''));
    const job = await getImportJob(id);
    if (job?.status === 'completed') clearApiCache();
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
      const result = await startImportJob(normalizeImportPayload(body));
      clearApiCache();
      jsonResponse(res, result.status, { job: result.job, reused: result.reused });
    } catch (error) {
      jsonResponse(res, 500, importErrorPayload(error));
    }
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/import-jobs') {
    try {
      const body = await readJsonBody(req);
      const payloads = normalizeImportBatchPayload(body);
      if (!payloads.length || payloads.some((payload) => !/^https?:\/\//i.test(payload.url))) {
        jsonResponse(res, 400, { error: 'Vui lòng nhập mỗi URL truyện hợp lệ trên một dòng.' });
        return true;
      }
      const results = await startImportJobs(payloads);
      clearApiCache();
      const status = results.some((result) => result.status === 202) ? 202 : 200;
      if (results.length === 1) {
        jsonResponse(res, status, { job: results[0].job, reused: results[0].reused, jobs: results });
        return true;
      }
      jsonResponse(res, status, { jobs: results, count: results.length });
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
  const staticPage = renderStaticPageShell(url.pathname, baseUrl);
  if (staticPage) {
    textResponse(res, 200, staticPage, 'text/html; charset=utf-8');
    return true;
  }

  if (url.pathname === '/robots.txt') {
    textResponse(res, 200, buildRobotsTxt(baseUrl), 'text/plain; charset=utf-8');
    return true;
  }
  if (url.pathname === '/sitemap.xml') {
    textResponse(res, 200, buildSiteMapFromCatalog(await readCatalog({ includePages: false }), baseUrl), 'application/xml; charset=utf-8');
    return true;
  }

  const seriesMatch = url.pathname.match(/^\/truyen\/([^/]+)$/);
  if (seriesMatch) {
    const series = findSeriesBySlug(await readCatalog({ includePages: false }), decodeURIComponent(seriesMatch[1]));
    if (!series) {
      textResponse(res, 404, renderNotFoundShell(url.pathname, baseUrl), 'text/html; charset=utf-8');
      return true;
    }
    textResponse(res, 200, renderHtmlShell({
      title: `${series.title} - Đọc truyện tranh tại Cuộn Truyện`,
      description: series.description || `Đọc ${series.title} liền mạch tại Cuộn Truyện, tự lưu vị trí và mở lại đúng chương đang đọc.`,
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
    if (!series || !chapter) {
      textResponse(res, 404, renderNotFoundShell(url.pathname, baseUrl), 'text/html; charset=utf-8');
      return true;
    }
    textResponse(res, 200, renderHtmlShell({
      title: `${series.title} - ${chapter.title} | Cuộn Truyện`,
      description: `Đọc ${series.title} ${chapter.title} online tại Cuộn Truyện với reader nối chapter liền mạch và lưu vị trí đọc.`,
      canonicalUrl: `${baseUrl}/truyen/${series.slug}/${chapter.slug}`,
      imageUrl: absoluteUrl(chapter.pages?.[0]?.imageUrl || series.coverUrl, baseUrl),
      jsonLd: chapterJsonLd(series, chapter, baseUrl)
    }), 'text/html; charset=utf-8');
    return true;
  }

  const tagMatch = url.pathname.match(/^\/the-loai\/([^/]+)$/);
  if (tagMatch) {
    const page = buildTagPage(await readCatalog({ includePages: false }), decodeURIComponent(tagMatch[1]));
    if (!page) {
      textResponse(res, 404, renderNotFoundShell(url.pathname, baseUrl), 'text/html; charset=utf-8');
      return true;
    }
    textResponse(res, 200, renderHtmlShell({
      title: `Truyện ${page.tag.name} - Cuộn Truyện`,
      description: `Danh sách truyện tranh thể loại ${page.tag.name} trên Cuộn Truyện, cập nhật mới và đọc liền mạch.`,
      canonicalUrl: `${baseUrl}/the-loai/${page.tag.slug}`
    }), 'text/html; charset=utf-8');
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }
    if (await handleApi(req, res, url)) return;
    if (await handleSeoRoute(req, res, url)) return;

    if (url.pathname.startsWith('/imports/')) {
      const rel = cleanRelativePath(url.pathname, '/imports/');
      await sendFile(res, path.join(IMPORT_ROOT, rel));
      return;
    }

    const rel = cleanRelativePath(url.pathname === '/' || isSpaRoutePath(url.pathname) ? '/index.html' : url.pathname);
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

await ensureStorageSchema();
await ensureCrawlQueueStorage();
kickEmbeddedCrawlWorker('startup');

server.listen(PORT, () => {
  const storageMode = usesPostgresStorage() ? 'PostgreSQL' : 'local JSON';
  console.log(`Comic reader running at http://localhost:${PORT} (${storageMode} catalog)`);
  if (EMBEDDED_CRAWL_WORKER_ENABLED) {
    console.log('Embedded crawl worker is enabled. Set CRAWL_EMBEDDED_WORKER=false to use a separate worker only.');
  }
});
