import './env.mjs';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { IMPORT_ROOT } from './catalogStore.mjs';
import { createBoundedCache } from './cacheStore.mjs';
import { ensureStorageSchema, getSeries, readCatalog } from './dataStore.mjs';
import { assertCatalogStorageReady, catalogStorageSummary } from './storageConfig.mjs';
import { appendAnalyticsEvent, buildAnalyticsSummary, listAnalyticsEvents } from './analyticsStore.mjs';
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
  getProductionPublishJob,
  productionPublishPreflightError
} from './productionPublishJobs.mjs';
import {
  buildProductionCheckTargets,
  checkProductionTargets
} from './productionCheck.mjs';
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
  seriesJsonLd,
  tagPageJsonLd,
  tagSeoCopy
} from './seo.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 4173);
const S3_SYNC_STATUS_FILE = path.resolve(process.env.S3_SYNC_STATUS_FILE || process.env.VIETNIX_S3_SYNC_STATUS_FILE || path.join(ROOT, '.runtime', 's3-sync-status.json'));
const S3_SYNC_STATE_FILE = path.resolve(process.env.S3_SYNC_STATE_FILE || process.env.VIETNIX_S3_SYNC_STATE_FILE || path.join(ROOT, '.runtime', 's3-sync-state.json'));
const API_CACHE_TTL_MS = 15_000;
const PUBLIC_API_CACHE_TTL_MS = Number(process.env.PUBLIC_API_LOCAL_CACHE_TTL_MS || 60_000);
const PRIVATE_API_CACHE_CONTROL = 'no-store';
const PUBLIC_API_CACHE_CONTROL = process.env.PUBLIC_API_CACHE_CONTROL || 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';
const PUBLIC_API_CACHE_OPTIONS = {
  ttlMs: PUBLIC_API_CACHE_TTL_MS,
  cacheControl: PUBLIC_API_CACHE_CONTROL
};
const apiResponseCache = createBoundedCache({ maxEntries: Number(process.env.API_CACHE_MAX_ENTRIES || 250) });
const SPA_ROUTE_PATHS = new Set(['/admin']);
const EMBEDDED_CRAWL_WORKER_ENABLED = !process.env.VERCEL && process.env.CRAWL_EMBEDDED_WORKER !== 'false';
const EMBEDDED_CRAWL_WORKER_ID = `server-crawl-worker-${process.pid}`;
const EMBEDDED_CRAWL_DRAIN_LIMIT = Math.max(1, Number(process.env.CRAWL_EMBEDDED_DRAIN_LIMIT || 50));
const CRAWL_API_ENABLED = !process.env.VERCEL || process.env.CRAWL_API_ENABLED === 'true';
let embeddedCrawlDrainPromise = null;
let embeddedCrawlDrainRequested = false;
let serverBootstrapPromise = null;

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
    const payload = catalogStorageErrorPayload(error, 'production status');
    return {
      updatedAt: '',
      stateFileExists: false,
      statuses: {},
      ...payload
    };
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

function redirectResponse(res, location, status = 301) {
  res.writeHead(status, {
    ...corsHeaders(),
    location,
    'cache-control': 'no-cache'
  });
  res.end();
}

async function cachedJsonResponse(req, res, key, producer, options = {}) {
  const {
    ttlMs = API_CACHE_TTL_MS,
    cacheControl = PRIVATE_API_CACHE_CONTROL
  } = typeof options === 'number' ? { ttlMs: options } : options;
  const now = Date.now();
  const cached = apiResponseCache.get(key);
  if (cached && cached.expiresAt > now) {
    res.writeHead(cached.status, {
      ...corsHeaders(),
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
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
    'cache-control': cacheControl,
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

function crawlDisabledPayload() {
  return {
    error: 'Crawl chỉ chạy ở backend local/crawler. Production Vercel chỉ dùng cho admin nhẹ và đọc truyện.',
    hint: 'Hãy mở admin local để crawl, rồi sync ảnh lên Vietnix S3 và sync catalog DB production.'
  };
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

let productionStatusCache = null;

async function readS3SyncState() {
  const rawState = await fs.readFile(S3_SYNC_STATE_FILE, 'utf8');
  return JSON.parse(rawState.replace(/^\uFEFF/, ''));
}

function isImportAssetReference(value = '') {
  const raw = String(value || '').trim();
  return raw.startsWith('/imports/') || raw.startsWith('imports/') || raw.includes('/imports/');
}

function productionStatusLabel(state) {
  if (state === 'ok') return 'Production OK';
  if (state === 'syncing') return 'Đang sync';
  if (state === 'missing-images') return 'Thiếu ảnh S3';
  if (state === 'not-public') return 'Chưa public';
  return 'Chưa kiểm tra';
}

function estimateProductionImageTotal(series = {}) {
  const pageCount = Number(series.pageCount || 0);
  const coverCount = [
    series.thumbnailUrl,
    series.coverThumbnailUrl,
    series.coverThumb,
    series.coverUrl,
    series.imageUrl
  ].some(isImportAssetReference) ? 1 : 0;
  return Math.max(0, pageCount) + coverCount;
}

function buildAdminProductionStatus(catalog = {}, syncState = {}, syncStatus = {}) {
  const objects = syncState.objects || {};
  const keys = Object.keys(objects);
  const importKeyCounts = new Map();

  for (const key of keys) {
    if (key.startsWith('imports/')) {
      const seriesId = key.split('/')[1] || '';
      if (seriesId) importKeyCounts.set(seriesId, (importKeyCounts.get(seriesId) || 0) + 1);
    }
  }

  const statuses = {};
  for (const series of catalog.series || []) {
    const seriesId = String(series.id || '').trim();
    if (!seriesId) continue;
    const imageTotal = estimateProductionImageTotal(series);
    const imageUploaded = importKeyCounts.get(seriesId) || 0;
    const syncMatchesSeries = syncStatus?.status === 'running' && String(syncStatus.seriesId || '') === seriesId;
    const imagesOk = imageTotal > 0 && imageUploaded >= imageTotal;
    let state = 'unchecked';

    if (String(series.status || 'draft') !== 'public') {
      state = 'not-public';
    } else if (syncMatchesSeries) {
      state = 'syncing';
    } else if (!imagesOk) {
      state = 'missing-images';
    } else {
      state = 'ok';
    }

    statuses[seriesId] = {
      state,
      label: productionStatusLabel(state),
      summary: imagesOk ? 'Ảnh production đã có trong S3 state.' : '',
      images: {
        uploaded: imageUploaded,
        total: imageTotal,
        missing: Math.max(0, imageTotal - imageUploaded)
      },
      sync: syncMatchesSeries ? {
        checked: Number(syncStatus.checked || 0),
        total: Number(syncStatus.total || 0),
        percent: Number(syncStatus.percent || 0),
        eta: syncStatus.eta || ''
      } : null,
      updatedAt: syncState.updatedAt || ''
    };
  }

  return {
    updatedAt: syncState.updatedAt || '',
    stateFileExists: true,
    storage: catalogStorageSummary(),
    statuses
  };
}

function catalogStorageErrorPayload(error, action = 'catalog') {
  const storage = catalogStorageSummary();
  const cause = String(error?.message || error || '');
  const hints = [];

  if (storage.mode === 'postgres') {
    hints.push('Catalog đang dùng Postgres. Kiểm tra CATALOG_DATABASE_URL, DATABASE_URL hoặc POSTGRES_URL.');
    if (/role ".*" does not exist/i.test(cause)) {
      hints.push('DB role không tồn tại. Chạy npm run db:local:setup hoặc cập nhật DB URL đúng.');
    }
    if (/ECONNREFUSED|timeout|ENOTFOUND|does not exist|password authentication/i.test(cause)) {
      hints.push('Kiểm tra local Postgres đang chạy và CATALOG_DATABASE_URL trỏ đúng DB.');
    }
  }

  return {
    error: `Không đọc được ${action}.`,
    cause,
    storage,
    hints
  };
}

async function readAdminProductionStatus() {
  const now = Date.now();
  if (productionStatusCache && productionStatusCache.expiresAt > now) return productionStatusCache.value;
  try {
    const [catalog, syncState, syncStatus] = await Promise.all([
      readAdminCatalog(),
      readS3SyncState(),
      readS3SyncStatus()
    ]);
    const value = buildAdminProductionStatus(catalog, syncState, syncStatus);
    productionStatusCache = { value, expiresAt: now + 10_000 };
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        updatedAt: '',
        stateFileExists: false,
        storage: catalogStorageSummary(),
        statuses: {},
        message: 'Chưa có dữ liệu S3 sync state local.'
      };
    }
    throw error;
  }
}

function localAdminOperationsEnabled() {
  return !process.env.VERCEL || process.env.ENABLE_LOCAL_CRAWLER_UI === 'true';
}

function localS3SyncEnabled() {
  return localAdminOperationsEnabled();
}

async function startRetryFailedS3Sync() {
  const status = await readS3SyncStatus();
  const updatedAtMs = Date.parse(status.updatedAt || '');
  const freshRunning = status.status === 'running'
    && Number.isFinite(updatedAtMs)
    && Date.now() - updatedAtMs < 90_000;
  if (freshRunning) {
    const error = new Error('S3 sync đang chạy, hãy đợi job hiện tại xong hoặc kẹt quá 90 giây rồi retry.');
    error.status = 409;
    throw error;
  }
  if (!Array.isArray(status.failedItems) || !status.failedItems.length) {
    const error = new Error('Chưa có file S3 lỗi để retry.');
    error.status = 400;
    throw error;
  }
  const child = spawn(process.execPath, ['scripts/sync-vietnix-s3.mjs', '--apply', '--retry-failed'], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0'
    },
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();
  return {
    started: true,
    pid: child.pid,
    retryCount: status.failedItems.length
  };
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

  if (req.method === 'POST' && (url.pathname === '/api/admin/login' || url.pathname === '/api/admin/session')) {
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

  if (req.method === 'GET' && url.pathname === '/api/admin/session') {
    jsonResponse(res, 200, {
      email: adminConfigStatus().email,
      authenticated: true
    });
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
    const id = String(url.searchParams.get('series') || url.searchParams.get('id') || '').trim();
    if (id) {
      await cachedJsonResponse(req, res, url.pathname + url.search, async () => {
        const series = await getSeries(id, { includePages: false, includeDraft: false });
        return { status: series ? 200 : 404, body: series ? publicSeriesDetail(series) : { error: 'Series not found' } };
      }, PUBLIC_API_CACHE_OPTIONS);
      return true;
    }
    const full = url.searchParams.get('full') === '1';
    const chapterLimit = full ? null : 3;
    const cacheKey = full ? `${url.pathname}?full=1` : url.pathname;
    await cachedJsonResponse(req, res, cacheKey, async () => ({ body: await readPublicCatalog({ chapterLimit }) }), PUBLIC_API_CACHE_OPTIONS);
    return true;
  }

  if (req.method === 'GET' && (url.pathname === '/api/admin/series' || url.pathname === '/api/admin/catalog')) {
    jsonResponse(res, 200, await readAdminCatalog());
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/events') {
    jsonResponse(res, 200, {
      events: await listAnalyticsEvents({ limit: Number(url.searchParams.get('limit') || 200) })
    });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/analytics/summary') {
    const range = url.searchParams.get('range') || '30d';
    jsonResponse(res, 200, buildAnalyticsSummary({
      catalog: await readCatalog({ includePages: false }),
      events: await listAnalyticsEvents({ limit: Number(url.searchParams.get('limit') || 5000) }),
      range
    }));
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/s3-sync/status') {
    jsonResponse(res, 200, await readS3SyncStatus());
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/production-status') {
    jsonResponse(res, 200, await readAdminProductionStatus());
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/s3-sync/retry-failed') {
    if (!localS3SyncEnabled()) {
      jsonResponse(res, 503, {
        error: 'Retry S3 chỉ chạy ở admin local/crawler, không chạy trên Vercel production.'
      });
      return true;
    }
    try {
      jsonResponse(res, 202, await startRetryFailedS3Sync());
    } catch (error) {
      jsonResponse(res, error.status || 500, { error: error.message || 'Không thể retry file S3 lỗi.' });
    }
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/production-check') {
    try {
      const body = await readJsonBody(req);
      const target = new URL(String(body.url || ''));
      if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Invalid production URL.');
      const seriesId = String(body.seriesId || '').trim();
      let targets = [{
        key: 'series-page',
        label: 'Trang truyện production',
        kind: 'html',
        required: true,
        url: target.toString()
      }];
      if (seriesId) {
        let series = null;
        try {
          const catalog = await readCatalog();
          series = findSeriesBySlug(catalog, seriesId, { includeDraft: true }) || await getSeries(seriesId, { includePages: true, includeDraft: true });
        } catch (error) {
          jsonResponse(res, 503, {
            ok: false,
            ...catalogStorageErrorPayload(error, 'catalog truoc khi check production')
          });
          return true;
        }
        if (!series) {
          jsonResponse(res, 404, { ok: false, error: 'Series not found' });
          return true;
        }
        targets = buildProductionCheckTargets({
          series,
          productionUrl: target.toString(),
          productionBaseUrl: process.env.PUBLIC_SITE_URL || getBaseUrl(req),
          importsBaseUrl: process.env.IMPORTS_BASE_URL || process.env.PUBLIC_IMPORTS_BASE_URL || process.env.S3_IMPORTS_BASE_URL || ''
        });
      }
      const result = await checkProductionTargets(targets, {
        fetchImpl: (targetUrl, options = {}) => fetch(targetUrl, {
          ...options,
          headers: {
            'user-agent': 'CuonTruyenAdminCheck/1.0',
            ...(options.headers || {})
          }
        })
      });
      jsonResponse(res, result.ok ? 200 : 502, {
        ...result,
        status: result.ok ? 200 : 502,
        url: target.toString()
      });
    } catch (error) {
      jsonResponse(res, 400, {
        ok: false,
        error: error.message || 'Production check failed.'
      });
    }
    return true;
  }

  if (req.method === 'GET' && (url.pathname === '/api/home' || url.pathname === '/api/public/home')) {
    await cachedJsonResponse(req, res, url.pathname, async () => ({ body: buildHomeCollections(await readCatalog({ includePages: false })) }), PUBLIC_API_CACHE_OPTIONS);
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/search') {
    await cachedJsonResponse(req, res, url.pathname + url.search, async () => ({ body: { series: searchCatalog(await readCatalog({ includePages: false }), url.searchParams.get('q') || '') } }), PUBLIC_API_CACHE_OPTIONS);
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/tags') {
    const tagSlug = String(url.searchParams.get('tag') || url.searchParams.get('slug') || '').trim();
    await cachedJsonResponse(req, res, url.pathname + url.search, async () => {
      const page = tagSlug ? buildTagPage(await readCatalog({ includePages: false }), tagSlug) : null;
      return { status: page ? 200 : 404, body: page || { error: 'Tag not found' } };
    }, PUBLIC_API_CACHE_OPTIONS);
    return true;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/tags/')) {
    const tagSlug = decodeURIComponent(url.pathname.replace('/api/tags/', ''));
    await cachedJsonResponse(req, res, url.pathname, async () => {
      const page = buildTagPage(await readCatalog({ includePages: false }), tagSlug);
      return { status: page ? 200 : 404, body: page || { error: 'Tag not found' } };
    }, PUBLIC_API_CACHE_OPTIONS);
    return true;
  }

  if (req.method === 'GET' && url.pathname.match(/^\/api\/series\/[^/]+\/chapters\/[^/]+$/)) {
    const [, , , seriesSlug, , chapterSlug] = url.pathname.split('/');
    await cachedJsonResponse(req, res, url.pathname + url.search, async () => {
      const payload = buildReaderChapterPayload(await readerCatalogForSeries(seriesSlug), decodeURIComponent(seriesSlug), decodeURIComponent(chapterSlug), {
        window: Number(url.searchParams.get('window') || 0)
      });
      return { status: payload ? 200 : 404, body: payload || { error: 'Chapter not found' } };
    }, PUBLIC_API_CACHE_OPTIONS);
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/reader') {
    const seriesSlug = String(url.searchParams.get('series') || '').trim();
    const chapterSlug = String(url.searchParams.get('chapter') || '').trim();
    const start = String(url.searchParams.get('start') || 'current').trim() || 'current';
    await cachedJsonResponse(req, res, url.pathname + url.search, async () => {
      const payload = seriesSlug && chapterSlug
        ? buildReaderChapterPayload(await readerCatalogForSeries(seriesSlug), seriesSlug, chapterSlug, {
            window: Number(url.searchParams.get('window') || 0),
            start
          })
        : null;
      return { status: payload ? 200 : 404, body: payload || { error: 'Chapter not found' } };
    }, PUBLIC_API_CACHE_OPTIONS);
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
    }, PUBLIC_API_CACHE_OPTIONS);
    return true;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/series/')) {
    const id = decodeURIComponent(url.pathname.replace('/api/series/', ''));
    await cachedJsonResponse(req, res, url.pathname, async () => {
      const series = await getSeries(id, { includePages: false, includeDraft: false });
      return { status: series ? 200 : 404, body: series ? publicSeriesDetail(series) : { error: 'Series not found' } };
    }, PUBLIC_API_CACHE_OPTIONS);
    return true;
  }

  if (req.method === 'PATCH' && url.pathname.match(/^\/api\/admin\/series\/[^/]+\/chapters\/[^/]+$/)) {
    const [, , , seriesId, , chapterId] = url.pathname.split('/');
    const result = await updateStoredChapter(decodeURIComponent(seriesId), decodeURIComponent(chapterId), await readJsonBody(req));
    clearApiCache();
    jsonResponse(res, result.chapter ? 200 : 404, result.chapter || { error: 'Chapter not found' });
    return true;
  }

  if (req.method === 'PATCH' && url.pathname.match(/^\/api\/admin\/chapters\/[^/]+$/)) {
    const chapterId = decodeURIComponent(url.pathname.replace('/api/admin/chapters/', ''));
    const body = await readJsonBody(req);
    let seriesId = String(body.seriesId || body.seriesSlug || '').trim();
    if (!seriesId) {
      const catalog = await readAdminCatalog();
      const owner = (catalog.series || []).find((series) => (
        Array.isArray(series.chapters)
        && series.chapters.some((chapter) => chapter.id === chapterId || chapter.slug === chapterId)
      ));
      seriesId = owner?.id || owner?.slug || '';
    }
    if (!seriesId) {
      jsonResponse(res, 400, { error: 'seriesId is required to update this chapter.' });
      return true;
    }
    const result = await updateStoredChapter(seriesId, chapterId, body);
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
    if (!CRAWL_API_ENABLED) {
      jsonResponse(res, 503, crawlDisabledPayload());
      return true;
    }
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
    if (!localAdminOperationsEnabled()) {
      jsonResponse(res, 503, {
        error: 'Production pipeline chỉ chạy ở admin local/crawler, không chạy trên Vercel production.'
      });
      return true;
    }
    const id = decodeURIComponent(url.pathname.split('/')[4]);
    const body = await readJsonBody(req);
    const preflightError = productionPublishPreflightError(body.steps || []);
    if (preflightError) {
      jsonResponse(res, 503, preflightError);
      return true;
    }
    let series = null;
    try {
      const catalog = await readCatalog({ includePages: false });
      series = findSeriesBySlug(catalog, id, { includeDraft: true }) || await getSeries(id, { includePages: false, includeDraft: true });
    } catch (error) {
      jsonResponse(res, 503, catalogStorageErrorPayload(error, 'catalog truoc khi publish production'));
      return true;
    }
    if (!series) {
      jsonResponse(res, 404, { error: 'Series not found' });
      return true;
    }
    const result = createProductionPublishJob({
      seriesId: series.id || id,
      seriesSlug: series.slug || '',
      title: series.title || '',
      steps: body.steps || []
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
    if (!CRAWL_API_ENABLED) {
      jsonResponse(res, 503, crawlDisabledPayload());
      return true;
    }
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
    if (!CRAWL_API_ENABLED) {
      jsonResponse(res, 503, crawlDisabledPayload());
      return true;
    }
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
    if (!CRAWL_API_ENABLED) {
      jsonResponse(res, 503, crawlDisabledPayload());
      return true;
    }
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
    const requestedSlug = decodeURIComponent(seriesMatch[1]);
    const series = findSeriesBySlug(await readCatalog({ includePages: false }), requestedSlug);
    if (!series) {
      textResponse(res, 404, renderNotFoundShell(url.pathname, baseUrl), 'text/html; charset=utf-8');
      return true;
    }
    if (requestedSlug !== series.slug) {
      redirectResponse(res, `/truyen/${encodeURIComponent(series.slug)}`);
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
    const requestedSeriesSlug = decodeURIComponent(chapterMatch[1]);
    const requestedChapterSlug = decodeURIComponent(chapterMatch[2]);
    const series = findSeriesBySlug(await readCatalog(), requestedSeriesSlug);
    const chapter = findChapterBySlug(series, requestedChapterSlug);
    if (!series || !chapter) {
      textResponse(res, 404, renderNotFoundShell(url.pathname, baseUrl), 'text/html; charset=utf-8');
      return true;
    }
    if (requestedSeriesSlug !== series.slug) {
      redirectResponse(res, `/truyen/${encodeURIComponent(series.slug)}/${encodeURIComponent(requestedChapterSlug)}`);
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
    const copy = tagSeoCopy(page.tag);
    textResponse(res, 200, renderHtmlShell({
      title: copy.title,
      description: copy.description,
      canonicalUrl: `${baseUrl}/the-loai/${page.tag.slug}`,
      jsonLd: tagPageJsonLd(page, baseUrl)
    }), 'text/html; charset=utf-8');
    return true;
  }

  return false;
}

export async function bootstrapServerStorage() {
  if (!serverBootstrapPromise) {
    serverBootstrapPromise = (async () => {
      assertCatalogStorageReady();
      await ensureStorageSchema();
      await ensureCrawlQueueStorage();
    })();
  }
  return serverBootstrapPromise;
}

export async function handleNodeRequest(req, res) {
  try {
    await bootstrapServerStorage();
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
}

export async function startServer() {
  await bootstrapServerStorage();
  kickEmbeddedCrawlWorker('startup');
  const server = http.createServer(handleNodeRequest);
  server.listen(PORT, () => {
    console.log(`Comic reader running at http://localhost:${PORT} (PostgreSQL catalog)`);
    if (EMBEDDED_CRAWL_WORKER_ENABLED) {
      console.log('Embedded crawl worker is enabled. Set CRAWL_EMBEDDED_WORKER=false to use a separate worker only.');
    }
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await startServer();
}
