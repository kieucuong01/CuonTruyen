import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCatalog } from '../server/dataStore.mjs';

const ROOT = process.cwd();
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);
const DEFAULT_IMPORT_ROOT = path.join(ROOT, 'data', 'imports');
const DEFAULT_STATIC_API_ROOT = path.join(ROOT, '.runtime', 'static-api');
const DEFAULT_SYNC_STATE_PATH = path.join(ROOT, '.runtime', 's3-sync-state.json');
const DEFAULT_SYNC_STATUS_PATH = path.join(ROOT, '.runtime', 's3-sync-status.json');

function arg(name) {
  return process.argv.includes(name);
}

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function argValues(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) values.push(process.argv[index + 1]);
  }
  return values;
}

function env(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && value !== '') return value;
  }
  return '';
}

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

function trimSlashes(value = '') {
  return String(value || '').replace(/^\/+|\/+$/g, '');
}

function toS3Key(...parts) {
  return parts
    .map((part) => trimSlashes(String(part || '').replace(/\\/g, '/')))
    .filter(Boolean)
    .join('/');
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
  }[ext] || 'application/octet-stream';
}

function cacheControlFor(kind) {
  if (kind === 'image') return env('S3_IMAGE_CACHE_CONTROL') || 'public, max-age=31536000, immutable';
  return env('S3_STATIC_API_CACHE_CONTROL') || 'public, max-age=60';
}

async function walkFiles(root, filter = () => true) {
  const files = [];
  async function walk(current) {
    const entries = (await fs.readdir(current, { withFileTypes: true }))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && filter(fullPath)) {
        files.push(fullPath);
      }
    }
  }
  try {
    await walk(root);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return files;
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function signingKey(secretAccessKey, dateStamp, region) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

function amzTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function canonicalUri(value) {
  return value
    .split('/')
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`))
    .join('/');
}

function normalizeHeaderValue(value) {
  return String(value).trim().replace(/\s+/g, ' ');
}

function signedHeaders(headers) {
  return Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort();
}

function signRequest({
  method,
  endpoint,
  bucket,
  key,
  region,
  accessKeyId,
  secretAccessKey,
  body = Buffer.alloc(0),
  headers = {},
  pathStyle = true
}) {
  const endpointUrl = new URL(endpoint);
  const host = pathStyle ? endpointUrl.host : `${bucket}.${endpointUrl.host}`;
  const rawPath = pathStyle ? `/${bucket}/${key}` : `/${key}`;
  const requestUrl = `${endpointUrl.protocol}//${host}${canonicalUri(rawPath)}`;
  const payloadHash = sha256Hex(body);
  const amzDate = amzTimestamp();
  const dateStamp = amzDate.slice(0, 8);
  const allHeaders = {
    ...headers,
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate
  };
  const names = signedHeaders(allHeaders);
  const canonicalHeaders = names.map((name) => `${name}:${normalizeHeaderValue(allHeaders[name] ?? allHeaders[Object.keys(allHeaders).find((keyName) => keyName.toLowerCase() === name)])}\n`).join('');
  const signedHeaderText = names.join(';');
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const canonicalRequest = [
    method,
    canonicalUri(rawPath),
    '',
    canonicalHeaders,
    signedHeaderText,
    payloadHash
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join('\n');
  const signature = hmac(signingKey(secretAccessKey, dateStamp, region), stringToSign, 'hex');
  return {
    url: requestUrl,
    headers: {
      ...allHeaders,
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderText}, Signature=${signature}`
    }
  };
}

async function headObject(client, key) {
  const signed = signRequest({ ...client, method: 'HEAD', key });
  const response = await fetchWithRetry(signed.url, {
    method: 'HEAD',
    headers: signed.headers
  }, {
    retries: Number(env('S3_HEAD_RETRIES', 'VIETNIX_S3_HEAD_RETRIES') || 0),
    delayMs: Number(env('S3_HEAD_RETRY_DELAY_MS', 'VIETNIX_S3_HEAD_RETRY_DELAY_MS') || env('S3_REQUEST_RETRY_DELAY_MS', 'VIETNIX_S3_REQUEST_RETRY_DELAY_MS') || 500),
    timeoutMs: Number(env('S3_HEAD_TIMEOUT_MS', 'VIETNIX_S3_HEAD_TIMEOUT_MS') || 2500)
  });
  if (response.status === 404) return { exists: false, size: 0 };
  if (!response.ok) throw new Error(`HEAD ${key} failed ${response.status}`);
  return {
    exists: true,
    size: Number(response.headers.get('content-length') || 0)
  };
}

async function putObject(client, item) {
  const body = await fs.readFile(item.filePath);
  const headers = {
    'cache-control': item.cacheControl,
    'content-type': item.contentType
  };
  const acl = env('S3_ACL', 'VIETNIX_S3_ACL');
  if (acl) headers['x-amz-acl'] = acl;
  const signed = signRequest({
    ...client,
    method: 'PUT',
    key: item.key,
    body,
    headers
  });
  const response = await fetchWithRetry(signed.url, {
    method: 'PUT',
    headers: signed.headers,
    body
  }, {
    retries: Number(env('S3_PUT_RETRIES', 'VIETNIX_S3_PUT_RETRIES') || env('S3_REQUEST_RETRIES', 'VIETNIX_S3_REQUEST_RETRIES') || 6),
    delayMs: Number(env('S3_PUT_RETRY_DELAY_MS', 'VIETNIX_S3_PUT_RETRY_DELAY_MS') || env('S3_REQUEST_RETRY_DELAY_MS', 'VIETNIX_S3_REQUEST_RETRY_DELAY_MS') || 1000),
    timeoutMs: Number(env('S3_PUT_TIMEOUT_MS', 'VIETNIX_S3_PUT_TIMEOUT_MS') || env('S3_REQUEST_TIMEOUT_MS', 'VIETNIX_S3_REQUEST_TIMEOUT_MS') || 60000)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = new Error(`PUT ${item.key} failed ${response.status}${text ? `: ${text.slice(0, 300)}` : ''}`);
    error.status = response.status;
    error.responseText = text;
    error.retryable = isRetryableS3Failure({ status: response.status, text });
    throw error;
  }
}

async function mapUploadItems() {
  const importRoot = path.resolve(env('IMPORT_ROOT') || DEFAULT_IMPORT_ROOT);
  const staticApiRoot = path.resolve(env('STATIC_API_OUTPUT_DIR') || DEFAULT_STATIC_API_ROOT);
  const importsPrefix = env('S3_IMPORTS_PREFIX', 'VIETNIX_S3_IMPORTS_PREFIX') || 'imports';
  const staticApiPrefix = env('S3_STATIC_API_PREFIX', 'VIETNIX_S3_STATIC_API_PREFIX') || 'static-api';
  const imagesOnly = arg('--images-only');
  const staticApiOnly = arg('--static-api-only');
  const catalogOnly = arg('--catalog-only');
  const seriesId = argValue('--series-id', '').trim();
  const explicitImageFiles = argValues('--image-file');
  const explicitStaticFiles = argValues('--static-file');
  const items = [];

  if (!staticApiOnly) {
    const imageRoot = seriesId ? path.join(importRoot, seriesId) : importRoot;
    const imageFiles = explicitImageFiles.length
      ? await collectExplicitImageFiles(importRoot, explicitImageFiles)
      : catalogOnly
      ? await collectCatalogImageFiles(importRoot, seriesId)
      : await walkFiles(imageRoot, (filePath) => IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase()));
    for (const filePath of imageFiles) {
      const relative = path.relative(importRoot, filePath).replace(/\\/g, '/');
      items.push({
        kind: 'image',
        filePath,
        key: toS3Key(importsPrefix, relative),
        contentType: contentTypeFor(filePath),
        cacheControl: cacheControlFor('image')
      });
    }
  }

  if (!imagesOnly) {
    const staticFiles = explicitStaticFiles.length
      ? await collectExplicitStaticFiles(staticApiRoot, explicitStaticFiles)
      : await walkFiles(staticApiRoot);
    for (const filePath of staticFiles) {
      const relative = path.relative(staticApiRoot, filePath).replace(/\\/g, '/');
      items.push({
        kind: 'static-api',
        filePath,
        key: toS3Key(staticApiPrefix, relative),
        contentType: contentTypeFor(filePath),
        cacheControl: cacheControlFor('static-api')
      });
    }
  }

  return items;
}

async function collectExplicitStaticFiles(staticApiRoot, values = []) {
  const root = path.resolve(staticApiRoot);
  const files = new Set();
  for (const value of values) {
    const raw = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
    const normalized = path.posix.normalize(raw);
    const filePath = path.isAbsolute(value)
      ? path.resolve(value)
      : path.resolve(root, ...normalized.split('/'));
    if (!isInsideDirectory(filePath, root)) continue;
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile()) files.add(filePath);
    } catch {}
  }
  return [...files].sort((a, b) => a.localeCompare(b));
}

async function collectExplicitImageFiles(importRoot, values = []) {
  const root = path.resolve(importRoot);
  const files = new Set();
  for (const value of values) {
    const relative = importRelativePath(value);
    const filePath = relative
      ? path.resolve(root, ...relative.split('/').map((part) => decodeURIComponent(part)))
      : path.resolve(value);
    if (!isInsideDirectory(filePath, root)) continue;
    if (!IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) continue;
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile()) files.add(filePath);
    } catch {}
  }
  return [...files].sort((a, b) => a.localeCompare(b));
}

async function collectCatalogImageFiles(importRoot, seriesId = '') {
  const catalog = await readCatalog();
  const root = path.resolve(importRoot);
  const candidates = new Set();
  const wantedSeriesId = String(seriesId || '').trim();
  const addCandidateValue = (value) => {
    const relative = importRelativePath(value);
    if (!relative) return;
    if (wantedSeriesId && !relative.startsWith(`${wantedSeriesId}/`)) return;
    const filePath = path.resolve(root, ...relative.split('/').map((part) => decodeURIComponent(part)));
    if (!isInsideDirectory(filePath, root)) return;
    if (IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) candidates.add(filePath);
  };
  for (const series of catalog.series || []) {
    if (wantedSeriesId && series.id !== wantedSeriesId && series.slug !== wantedSeriesId) continue;
    for (const value of [
      series.thumbnailUrl,
      series.coverThumbnailUrl,
      series.coverThumb,
      series.coverUrl,
      series.imageUrl
    ]) {
      addCandidateValue(value);
    }
    for (const chapter of series.chapters || []) {
      for (const page of chapter.pages || []) {
        for (const value of [page.src, page.imageUrl, page.storageKey]) {
          addCandidateValue(value);
        }
      }
    }
  }
  const files = [];
  const statConcurrency = Math.max(1, Number(env('S3_CATALOG_STAT_CONCURRENCY', 'VIETNIX_S3_CATALOG_STAT_CONCURRENCY') || 64));
  await runConcurrent([...candidates].sort((a, b) => a.localeCompare(b)), statConcurrency, async (filePath) => {
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile()) files.push(filePath);
    } catch {}
  });
  return files.sort((a, b) => a.localeCompare(b));
}

function importRelativePath(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const marker = '/imports/';
  if (raw.startsWith('/imports/')) return cleanImportRelative(raw.slice(marker.length));
  if (raw.startsWith('imports/')) return cleanImportRelative(raw.slice('imports/'.length));
  try {
    const parsed = new URL(raw);
    const index = parsed.pathname.indexOf(marker);
    if (index >= 0) return cleanImportRelative(parsed.pathname.slice(index + marker.length));
  } catch {}
  return '';
}

function cleanImportRelative(value = '') {
  const cleaned = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const normalized = path.posix.normalize(cleaned);
  if (!normalized || normalized === '.' || normalized.startsWith('../')) return '';
  return normalized;
}

function isInsideDirectory(filePath, root) {
  const relative = path.relative(root, filePath);
  return Boolean(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

async function runConcurrent(items, limit, task) {
  let index = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await task(current, index);
    }
  });
  await Promise.all(workers);
}

async function fetchWithRetry(url, options, {
  retries = Number(env('S3_REQUEST_RETRIES', 'VIETNIX_S3_REQUEST_RETRIES') || 5),
  delayMs = Number(env('S3_REQUEST_RETRY_DELAY_MS', 'VIETNIX_S3_REQUEST_RETRY_DELAY_MS') || 1000),
  timeoutMs = Number(env('S3_REQUEST_TIMEOUT_MS', 'VIETNIX_S3_REQUEST_TIMEOUT_MS') || 15000)
} = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = timeoutMs > 0 ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetch(url, {
        ...options,
        ...(controller ? { signal: controller.signal } : {})
      });
      if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === retries) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    await delay(backoffDelay(delayMs, attempt));
  }
  throw lastError;
}

async function loadSyncState(filePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return parsed && typeof parsed.objects === 'object' && parsed.objects ? parsed.objects : {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function saveSyncState(filePath, objects) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    objects
  }, null, 2));
}

function syncStateEntry(stat) {
  return {
    size: stat.size,
    mtimeMs: Math.round(stat.mtimeMs),
    at: new Date().toISOString()
  };
}

function syncStateMatches(entry, stat) {
  return Boolean(
    entry
    && Number(entry.size) === Number(stat.size)
    && Math.round(Number(entry.mtimeMs || 0)) === Math.round(stat.mtimeMs)
  );
}

async function saveSyncStatus(filePath, status) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    ...status
  }, null, 2));
}

function chapterFromSyncKey(key = '') {
  const parts = String(key || '').split('/').filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

async function main() {
  await loadEnvFile(path.join(ROOT, '.env.local'));
  await loadEnvFile(path.join(ROOT, '.env'));

  const endpoint = env('S3_ENDPOINT', 'VIETNIX_S3_ENDPOINT');
  const bucket = env('S3_BUCKET', 'VIETNIX_S3_BUCKET');
  const region = env('S3_REGION', 'VIETNIX_S3_REGION') || 'us-east-1';
  const accessKeyId = env('S3_ACCESS_KEY_ID', 'AWS_ACCESS_KEY_ID', 'VIETNIX_S3_ACCESS_KEY_ID');
  const secretAccessKey = env('S3_SECRET_ACCESS_KEY', 'AWS_SECRET_ACCESS_KEY', 'VIETNIX_S3_SECRET_ACCESS_KEY');
  const pathStyle = String(env('S3_PATH_STYLE', 'VIETNIX_S3_PATH_STYLE') || 'true').toLowerCase() !== 'false';
  const apply = arg('--apply');
  const force = arg('--force');
  const seriesId = argValue('--series-id', '').trim();
  const retryFailed = arg('--retry-failed');
  const allowFull = arg('--all') || ['1', 'true', 'yes', 'on'].includes(String(env('S3_SYNC_ALLOW_FULL', 'VIETNIX_S3_SYNC_ALLOW_FULL') || '').toLowerCase());
  const includesImages = !arg('--static-api-only');
  const concurrency = Math.max(1, Number(env('S3_SYNC_CONCURRENCY', 'VIETNIX_S3_SYNC_CONCURRENCY') || 8));
  const useState = !arg('--no-state') && String(env('S3_SYNC_STATE', 'VIETNIX_S3_SYNC_STATE') || '1').toLowerCase() !== '0';
  const stateFile = path.resolve(argValue('--state-file', env('S3_SYNC_STATE_FILE', 'VIETNIX_S3_SYNC_STATE_FILE') || DEFAULT_SYNC_STATE_PATH));
  const statusFile = path.resolve(argValue('--status-file', env('S3_SYNC_STATUS_FILE', 'VIETNIX_S3_SYNC_STATUS_FILE') || DEFAULT_SYNC_STATUS_PATH));
  const stateSaveEvery = Math.max(1, Number(env('S3_SYNC_STATE_SAVE_EVERY', 'VIETNIX_S3_SYNC_STATE_SAVE_EVERY') || 200));
  const stateSaveIntervalMs = Math.max(1000, Number(env('S3_SYNC_STATE_SAVE_INTERVAL_MS', 'VIETNIX_S3_SYNC_STATE_SAVE_INTERVAL_MS') || 15000));

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing S3 config. Required: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.');
  }
  const explicitImageFiles = argValues('--image-file').length > 0;
  if (shouldRefuseFullImageSync({ includesImages, seriesId, allowFull, retryFailed, explicitImageFiles })) {
    throw new Error('Refusing full image S3 sync without --series-id. Use --series-id <series-id> for normal publish, --image-file <imports path> for targeted files, --retry-failed to retry missing files, or --all / S3_SYNC_ALLOW_FULL=true when you intentionally want a full image sync.');
  }

  const client = { endpoint, bucket, region, accessKeyId, secretAccessKey, pathStyle };
  const syncState = useState ? await loadSyncState(stateFile) : {};
  let items = await mapUploadItems();
  if (retryFailed) {
    const failedKeys = await loadFailedKeysFromStatus(statusFile);
    items = items.filter((item) => failedKeys.has(item.key));
    if (!items.length) throw new Error('No failed S3 files found to retry. Check .runtime/s3-sync-status.json first.');
  }
  const limit = Number(argValue('--limit', 0));
  if (limit > 0) items = items.slice(0, limit);
  let uploaded = 0;
  let skipped = 0;
  let cachedSkipped = 0;
  let checked = 0;
  let failed = 0;
  const failedItems = [];
  const startedAt = Date.now();
  let lastProgressAt = 0;
  let currentItem = null;
  let stateDirtyCount = 0;
  let lastStateSaveAt = Date.now();

  const retryRounds = Math.max(0, Number(env('S3_SYNC_RETRY_ROUNDS', 'VIETNIX_S3_SYNC_RETRY_ROUNDS') || 3));
  const retryConcurrency = Math.max(1, Math.min(
    concurrency,
    Number(env('S3_SYNC_RETRY_CONCURRENCY', 'VIETNIX_S3_SYNC_RETRY_CONCURRENCY') || Math.min(2, concurrency))
  ));
  const retryRoundDelayMs = Math.max(0, Number(env('S3_SYNC_RETRY_ROUND_DELAY_MS', 'VIETNIX_S3_RETRY_ROUND_DELAY_MS') || 5000));
  let failedAttempts = 0;
  let recovered = 0;
  let retryRound = 0;

  console.log(`[s3-sync] ${apply ? 'apply' : 'dry-run'} ${items.length} files to s3://${bucket} concurrency=${concurrency} retryRounds=${retryRounds} retryConcurrency=${retryConcurrency} state=${useState ? stateFile : 'off'} ${retryFailed ? 'retryFailed=true' : ''}`);
  await writeStatus({ status: 'running', message: s3SyncScopeMessage({ retryFailed, failedCount: items.length, seriesId }) });

  let retryQueue = await runSyncPass(items, {
    countChecked: true,
    limit: concurrency,
    message: 'Dang dong bo S3...'
  });

  while (apply && retryQueue.length && retryRound < retryRounds) {
    retryRound += 1;
    failed = retryQueue.length;
    console.log(`[s3-sync] retry round=${retryRound}/${retryRounds} files=${retryQueue.length} concurrency=${retryConcurrency}`);
    await writeStatus({
      status: 'running',
      message: `Dang retry ${retryQueue.length} file loi tam thoi (lan ${retryRound}/${retryRounds})...`
    });
    await delay(retryRoundDelayMs * retryRound);
    retryQueue = await runSyncPass(retryQueue, {
      countChecked: false,
      retrying: true,
      limit: retryConcurrency,
      message: `Dang retry file loi tam thoi (${retryRound}/${retryRounds})...`
    });
  }
  failed = retryQueue.length;

  console.log(progressLine({ done: true }));
  await maybeSaveSyncState(true);
  if (failedItems.length) {
    console.log(`[s3-sync] failed-items ${JSON.stringify(failedItems)}`);
  }
  if (failed > 0) {
    await writeStatus({ status: 'failed', message: `Dong bo S3 con loi ${failed} file sau ${retryRound} vong retry. Chay lai job de tiep tuc cac file con thieu.` });
    throw new Error(`S3 sync finished with ${failed} failed file(s). Re-run the same command to retry missing files.`);
  }
  await writeStatus({ status: 'completed', message: recovered ? `Da dong bo S3 xong, tu phuc hoi ${recovered} file loi tam thoi.` : 'Da dong bo S3 xong.' });

  async function runSyncPass(passItems, { countChecked = true, retrying = false, limit = concurrency, message = '' } = {}) {
    const roundFailures = [];
    await runConcurrent(passItems, limit, async (item) => {
      if (countChecked) checked += 1;
      currentItem = item;
      try {
        await syncOneItem(item);
        if (retrying) {
          recovered += 1;
          failed = Math.max(0, failed - 1);
          forgetFailedItem(item);
        }
        await maybePrintProgress(item, message);
      } catch (error) {
        failedAttempts += 1;
        if (!retrying) failed += 1;
        roundFailures.push(item);
        rememberFailedItem(item, error);
        console.log(`[s3-sync] failed key=${item.key} error=${shortError(error)} checked=${checked}/${items.length} uploaded=${uploaded} skipped=${skipped} failed=${failed} attempts=${failedAttempts}${error?.retryable ? ' retryable=true' : ''}`);
        await maybePrintProgress(item, message);
      }
    });
    return roundFailures;
  }

  async function syncOneItem(item) {
    const stat = await fs.stat(item.filePath);
    if (!force && useState && syncStateMatches(syncState[item.key], stat)) {
      skipped += 1;
      cachedSkipped += 1;
      return;
    }
    let remote = { exists: false, size: 0 };
    const skipHead = ['1', 'true', 'yes', 'on'].includes(
      String(env('S3_SKIP_HEAD', 'VIETNIX_S3_SKIP_HEAD') || '').toLowerCase()
    );
    if (!force && !skipHead) {
      try {
        remote = await headObject(client, item.key);
      } catch (error) {
        if (!apply || !isSoftHeadFailure(error)) throw error;
        remote = { exists: false, size: 0, assumedMissing: true };
      }
    }
    if (remote.exists && remote.size === stat.size) {
      skipped += 1;
      await markStateSynced(item.key, stat);
      return;
    }
    if (apply) await putObject(client, item);
    await markStateSynced(item.key, stat);
    uploaded += 1;
  }

  async function markStateSynced(key, stat) {
    if (!apply || !useState) return;
    syncState[key] = syncStateEntry(stat);
    stateDirtyCount += 1;
    await maybeSaveSyncState(false);
  }

  async function maybeSaveSyncState(force = false) {
    if (!apply || !useState) return;
    const now = Date.now();
    if (!force && stateDirtyCount < stateSaveEvery && now - lastStateSaveAt < stateSaveIntervalMs) return;
    await saveSyncState(stateFile, syncState);
    stateDirtyCount = 0;
    lastStateSaveAt = now;
  }

  function rememberFailedItem(item, error) {
    const existingIndex = failedItems.findIndex((failedItem) => failedItem.key === item.key);
    const entry = {
      key: item.key,
      error: shortError(error),
      attempts: failedAttempts,
      retryRound
    };
    const failedItemsMax = Math.max(20, Number(env('S3_FAILED_ITEMS_MAX', 'VIETNIX_S3_FAILED_ITEMS_MAX') || 1000));
    if (existingIndex >= 0) failedItems.splice(existingIndex, 1);
    failedItems.push(entry);
    if (failedItems.length > failedItemsMax) failedItems.splice(0, failedItems.length - failedItemsMax);
  }

  function forgetFailedItem(item) {
    const existingIndex = failedItems.findIndex((failedItem) => failedItem.key === item.key);
    if (existingIndex >= 0) failedItems.splice(existingIndex, 1);
  }

  async function maybePrintProgress(item = currentItem, message = '') {
    const now = Date.now();
    if (
      checked === items.length
      || checked % 200 === 0
      || (uploaded > 0 && uploaded % 50 === 0)
      || now - lastProgressAt > 5_000
    ) {
      lastProgressAt = now;
      console.log(progressLine());
      await writeStatus({ status: 'running', item, message });
    }
  }

  async function writeStatus({ status = 'running', message = '', item = currentItem } = {}) {
    const elapsedSeconds = Math.max(0.001, (Date.now() - startedAt) / 1000);
    const ratePerMinute = checked / (elapsedSeconds / 60);
    const remaining = Math.max(0, items.length - checked);
    const etaSeconds = checked > 0 ? remaining / (checked / elapsedSeconds) : 0;
    const percent = items.length ? Math.round((checked / items.length) * 1000) / 10 : 0;
    const activeItem = item || currentItem || {};
    await saveSyncStatus(statusFile, {
      status,
      apply,
      force,
      bucket,
      seriesId,
      total: items.length,
      checked,
      uploaded,
      skipped,
      cachedSkipped,
      failed,
      failedAttempts,
      recovered,
      pendingRetry: failed,
      retryRound,
      retryRounds,
      percent,
      ratePerMinute: roundOne(ratePerMinute),
      etaSeconds: Math.round(etaSeconds),
      eta: formatDuration(etaSeconds),
      concurrency,
      retryConcurrency,
      currentKey: activeItem.key || '',
      currentChapter: chapterFromSyncKey(activeItem.key || ''),
      failedItems: failedItems.slice(),
      failedItemCount: failedItems.length,
      startedAt: new Date(startedAt).toISOString(),
      message
    });
  }

  function progressLine({ done = false } = {}) {
    const elapsedSeconds = Math.max(0.001, (Date.now() - startedAt) / 1000);
    const ratePerMinute = checked / (elapsedSeconds / 60);
    const remaining = Math.max(0, items.length - checked);
    const etaSeconds = checked > 0 ? remaining / (checked / elapsedSeconds) : 0;
    const label = done ? 'done' : 'progress';
    return `[s3-sync] ${label} checked=${checked}/${items.length} uploaded=${uploaded} skipped=${skipped} cached=${cachedSkipped} failed=${failed} rate=${roundOne(ratePerMinute)} files/min eta=${formatDuration(etaSeconds)} concurrency=${concurrency} attempts=${failedAttempts} recovered=${recovered} retryRound=${retryRound}`;
  }
}

function backoffDelay(baseDelayMs, attempt) {
  const base = Math.max(0, Number(baseDelayMs || 0));
  const exponential = base * (2 ** Math.max(0, attempt));
  const jitter = Math.floor(Math.random() * Math.max(1, base));
  return Math.min(30000, exponential + jitter);
}

export function shouldRefuseFullImageSync({
  includesImages,
  seriesId = '',
  allowFull = false,
  retryFailed = false,
  explicitImageFiles = false
} = {}) {
  return Boolean(includesImages && !String(seriesId || '').trim() && !allowFull && !retryFailed && !explicitImageFiles);
}

export function isRetryableS3Failure({ status = 0, text = '' } = {}) {
  const body = String(text || '').toLowerCase();
  return [408, 429, 500, 502, 503, 504].includes(Number(status))
    || body.includes('requesttimetoo skewed')
    || body.includes('requesttimetooskewed')
    || body.includes('request time')
    || body.includes('clock skew');
}

export function s3SyncScopeMessage({ retryFailed = false, failedCount = 0, seriesId = '' } = {}) {
  if (retryFailed) return `Retry ${Number(failedCount || 0)} file thiếu/lỗi trên S3...`;
  if (seriesId) return `Đang đồng bộ S3 cho truyện ${seriesId}...`;
  return 'Đang đồng bộ S3...';
}

async function loadFailedKeysFromStatus(filePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    return new Set((parsed.failedItems || [])
      .map((item) => String(item?.key || '').trim())
      .filter(Boolean));
  } catch (error) {
    if (error.code === 'ENOENT') return new Set();
    throw error;
  }
}

function shortError(error) {
  const causeCode = error?.cause?.code ? ` ${error.cause.code}` : '';
  return String(`${error?.name || 'Error'}${causeCode}: ${error?.message || error}`).replace(/\s+/g, ' ').slice(0, 220);
}

function isSoftHeadFailure(error) {
  const text = String(`${error?.name || ''} ${error?.cause?.code || ''} ${error?.message || ''}`).toLowerCase();
  return (
    text.includes('abort')
    || text.includes('timeout')
    || text.includes('und_err_connect_timeout')
    || text.includes('fetch failed')
    || text.includes('econnreset')
    || text.includes('socket')
  );
}

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  if (!Number.isFinite(value) || value <= 0) return '0s';
  if (value < 60) return `${Math.ceil(value)}s`;
  const minutes = Math.floor(value / 60);
  const remainingSeconds = Math.round(value % 60);
  if (minutes < 60) return remainingSeconds ? `${minutes}m${remainingSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h${remainingMinutes}m` : `${hours}h`;
}

function roundOne(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
