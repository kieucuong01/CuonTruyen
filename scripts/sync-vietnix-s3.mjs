import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif']);
const DEFAULT_IMPORT_ROOT = path.join(ROOT, 'data', 'imports');
const DEFAULT_STATIC_API_ROOT = path.join(ROOT, '.runtime', 'static-api');

function arg(name) {
  return process.argv.includes(name);
}

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
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
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`PUT ${item.key} failed ${response.status}${text ? `: ${text.slice(0, 300)}` : ''}`);
  }
}

async function mapUploadItems() {
  const importRoot = path.resolve(env('IMPORT_ROOT') || DEFAULT_IMPORT_ROOT);
  const staticApiRoot = path.resolve(env('STATIC_API_OUTPUT_DIR') || DEFAULT_STATIC_API_ROOT);
  const importsPrefix = env('S3_IMPORTS_PREFIX', 'VIETNIX_S3_IMPORTS_PREFIX') || 'imports';
  const staticApiPrefix = env('S3_STATIC_API_PREFIX', 'VIETNIX_S3_STATIC_API_PREFIX') || 'static-api';
  const imagesOnly = arg('--images-only');
  const staticApiOnly = arg('--static-api-only');
  const seriesId = argValue('--series-id', '').trim();
  const items = [];

  if (!staticApiOnly) {
    const imageRoot = seriesId ? path.join(importRoot, seriesId) : importRoot;
    const imageFiles = await walkFiles(imageRoot, (filePath) => IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase()));
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
    const staticFiles = await walkFiles(staticApiRoot);
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
  retries = Number(env('S3_REQUEST_RETRIES', 'VIETNIX_S3_REQUEST_RETRIES') || 3),
  delayMs = Number(env('S3_REQUEST_RETRY_DELAY_MS', 'VIETNIX_S3_REQUEST_RETRY_DELAY_MS') || 500)
} = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === retries) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === retries) throw error;
    }
    await delay(delayMs * (attempt + 1));
  }
  throw lastError;
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
  const concurrency = Math.max(1, Number(env('S3_SYNC_CONCURRENCY', 'VIETNIX_S3_SYNC_CONCURRENCY') || 8));

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('Missing S3 config. Required: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY.');
  }

  const client = { endpoint, bucket, region, accessKeyId, secretAccessKey, pathStyle };
  let items = await mapUploadItems();
  const limit = Number(argValue('--limit', 0));
  if (limit > 0) items = items.slice(0, limit);
  let uploaded = 0;
  let skipped = 0;
  let checked = 0;
  const startedAt = Date.now();
  let lastProgressAt = 0;

  console.log(`[s3-sync] ${apply ? 'apply' : 'dry-run'} ${items.length} files to s3://${bucket} concurrency=${concurrency}`);
  await runConcurrent(items, concurrency, async (item) => {
    const stat = await fs.stat(item.filePath);
    let remote = { exists: false, size: 0 };
    if (!force) remote = await headObject(client, item.key);
    checked += 1;
    if (remote.exists && remote.size === stat.size) {
      skipped += 1;
      maybePrintProgress();
      return;
    }
    if (apply) await putObject(client, item);
    uploaded += 1;
    maybePrintProgress();
  });

  console.log(progressLine({ done: true }));

  function maybePrintProgress() {
    const now = Date.now();
    if (
      checked === items.length
      || checked % 200 === 0
      || (uploaded > 0 && uploaded % 50 === 0)
      || now - lastProgressAt > 5_000
    ) {
      lastProgressAt = now;
      console.log(progressLine());
    }
  }

  function progressLine({ done = false } = {}) {
    const elapsedSeconds = Math.max(0.001, (Date.now() - startedAt) / 1000);
    const ratePerMinute = checked / (elapsedSeconds / 60);
    const remaining = Math.max(0, items.length - checked);
    const etaSeconds = checked > 0 ? remaining / (checked / elapsedSeconds) : 0;
    const label = done ? 'done' : 'progress';
    return `[s3-sync] ${label} checked=${checked}/${items.length} uploaded=${uploaded} skipped=${skipped} rate=${roundOne(ratePerMinute)} files/min eta=${formatDuration(etaSeconds)} concurrency=${concurrency}`;
  }
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
