import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { catalogStorageSummary, productionPostgresCatalogUrl } from './storageConfig.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MAX_LOG_LINES = 80;
const MAX_LOG_TEXT = 24_000;
const jobs = new Map();

export function createProductionPublishJob({ seriesId, seriesSlug = '', title = '', steps = [] } = {}) {
  const normalizedSeriesId = String(seriesId || '').trim();
  if (!normalizedSeriesId) throw new Error('Series id is required.');

  const requestedSteps = normalizeRequestedSteps(steps);
  const runningJob = [...jobs.values()].find((job) => (
    job.seriesId === normalizedSeriesId
    && sameStepSet(job.requestedSteps, requestedSteps)
    && ['queued', 'running'].includes(job.status)
  ));
  if (runningJob) return { job: publicJob(runningJob), reused: true };

  const job = {
    id: `production-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    seriesId: normalizedSeriesId,
    seriesSlug: String(seriesSlug || ''),
    title: String(title || ''),
    status: 'queued',
    stepIndex: -1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: '',
    error: '',
    logs: [],
    requestedSteps,
    storage: catalogStorageSummary(),
    steps: buildProductionPublishSteps(normalizedSeriesId, { requestedSteps }),
    result: {}
  };
  jobs.set(job.id, job);
  runProductionPublishJob(job);
  return { job: publicJob(job), reused: false };
}

export function getProductionPublishJob(id) {
  const job = jobs.get(String(id || ''));
  return job ? publicJob(job) : null;
}

export function productionPublishPreflightError(steps = []) {
  const requestedSteps = normalizeRequestedSteps(steps);
  const includesCatalogDb = requestedSteps.length
    ? requestedSteps.includes('sync-catalog-db')
    : true;
  if (!includesCatalogDb || productionDatabaseUrl()) return null;
  return {
    error: 'Missing PRODUCTION_CATALOG_DATABASE_URL or PRODUCTION_DATABASE_URL.',
    detail: 'Set a dedicated production Supabase/Postgres URL before running Sync catalog DB.',
    storage: catalogStorageSummary(),
    hints: [
      'Set PRODUCTION_CATALOG_DATABASE_URL in .env.local for local production pipeline.'
    ]
  };
}

export function buildProductionPublishSteps(seriesId, { requestedSteps = [] } = {}) {
  const includeDeepMaintenance = String(process.env.PRODUCTION_PUBLISH_DEEP_MAINTENANCE || '').toLowerCase() === 'true';
  const optimizeLimit = String(process.env.PRODUCTION_PUBLISH_OPTIMIZE_LIMIT || '800');
  const allSteps = [
    {
      key: 'optimize',
      label: 'Tá»‘i Æ°u áº£nh nhanh',
      description: 'Fast publish: chá»‰ tá»‘i Æ°u má»™t lÃ´ áº£nh lá»›n/chÆ°a tá»‘i Æ°u Ä‘á»ƒ trÃ¡nh káº¹t job quÃ¡ lÃ¢u.',
      command: [process.execPath, 'scripts/optimize-import-images.mjs', '--catalog-only', '--series-id', seriesId, '--limit', optimizeLimit, '--apply', '--json']
    },
    {
      key: 'sync-images',
      label: 'Sync áº£nh truyá»‡n lÃªn S3',
      description: 'Äáº©y riÃªng thÆ° má»¥c áº£nh cá»§a truyá»‡n lÃªn Vietnix S3.',
      command: [process.execPath, 'scripts/sync-vietnix-s3.mjs', '--images-only', '--catalog-only', '--series-id', seriesId, '--apply'],
      s3Step: true
    },
    {
      key: 'sync-catalog-db',
      label: 'Sync catalog DB production',
      description: 'Day metadata/chapter/page cua truyen nay len production Postgres sau khi anh da len S3.',
      command: [process.execPath, 'scripts/sync-catalog-to-production-db.mjs', '--series-id', seriesId, '--apply']
    }
  ];

  if (includeDeepMaintenance) {
    allSteps.splice(1, 0,
      {
        key: 'relink',
        label: 'Relink anh da toi uu',
        description: 'Deep maintenance: cap nhat catalog tro sang WebP da co va don file goc.',
        command: [process.execPath, 'scripts/relink-existing-optimized-images.mjs', '--series-id', seriesId, '--apply', '--cleanup-originals']
      },
      {
        key: 'cleanup',
        label: 'Don anh thua cua truyen',
        description: 'Deep maintenance: xoa anh local khong con duoc catalog tham chieu.',
        command: [process.execPath, 'scripts/cleanup-unreferenced-import-images.mjs', '--series-id', seriesId, '--apply']
      }
    );
  }

  const wanted = new Set(requestedSteps.length ? requestedSteps : ['optimize', 'sync-images', 'sync-catalog-db']);
  const steps = allSteps.filter((step) => wanted.has(step.key));
  return steps.map((step) => ({
    ...step,
    status: 'pending',
    startedAt: '',
    finishedAt: '',
    exitCode: null,
    output: '',
    error: ''
  }));
}

function normalizeRequestedSteps(steps = []) {
  const allowed = new Set(['optimize', 'relink', 'cleanup', 'sync-images', 'sync-catalog-db']);
  return [...new Set((Array.isArray(steps) ? steps : [])
    .map((step) => String(step || '').trim())
    .filter((step) => allowed.has(step)))];
}

function sameStepSet(left = [], right = []) {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  return right.every((step) => leftSet.has(step));
}
async function runProductionPublishJob(job) {
  job.status = 'running';
  touch(job);
  try {
    preflightProductionPublishJob(job);
    for (let index = 0; index < job.steps.length; index += 1) {
      job.stepIndex = index;
      const step = job.steps[index];
      step.status = 'running';
      step.startedAt = new Date().toISOString();
      touch(job);
      appendLog(job, `Báº¯t Ä‘áº§u: ${step.label}`);
      const result = await runCommand(step.command, {
        s3Step: step.s3Step,
        onOutput: (text) => handleStepOutput(job, step, text)
      });
      step.exitCode = result.exitCode;
      step.output = result.output;
      if (result.exitCode !== 0) {
        step.status = 'failed';
        step.error = result.output || `Command exited with code ${result.exitCode}`;
        step.finishedAt = new Date().toISOString();
        throw new Error(step.error);
      }
      step.status = 'completed';
      step.finishedAt = new Date().toISOString();
      appendLog(job, `HoÃ n táº¥t: ${step.label}`);
      touch(job);
    }
    job.status = 'completed';
    job.finishedAt = new Date().toISOString();
    job.result = {
      message: 'ÄÃ£ tá»‘i Æ°u, export vÃ  sync production xong.',
      completedAt: job.finishedAt
    };
    appendLog(job, job.result.message);
  } catch (error) {
    job.status = 'failed';
    job.error = cleanLog(error?.message || 'Production workflow failed.');
    job.finishedAt = new Date().toISOString();
    appendLog(job, `Lá»—i: ${job.error}`);
  } finally {
    touch(job);
  }
}

function preflightProductionPublishJob(job) {
  const payload = productionPublishPreflightError(job.requestedSteps);
  if (!payload) return;
  throw new Error([payload.error, payload.detail].filter(Boolean).join(' '));
}

function productionDatabaseUrl() {
  return productionPostgresCatalogUrl();
}

function runCommand(command, { s3Step = false, onOutput = null } = {}) {
  return new Promise((resolve) => {
    const [bin, ...args] = command;
    const env = {
      ...process.env,
      ...(s3Step ? {
        NODE_TLS_REJECT_UNAUTHORIZED: process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0',
        S3_SYNC_CONCURRENCY: process.env.S3_SYNC_CONCURRENCY || process.env.VIETNIX_S3_SYNC_CONCURRENCY || '6',
        S3_SYNC_RETRY_CONCURRENCY: process.env.S3_SYNC_RETRY_CONCURRENCY || process.env.VIETNIX_S3_SYNC_RETRY_CONCURRENCY || '2',
        S3_SYNC_RETRY_ROUNDS: process.env.S3_SYNC_RETRY_ROUNDS || process.env.VIETNIX_S3_SYNC_RETRY_ROUNDS || '3',
        S3_SYNC_STATE_SAVE_EVERY: process.env.S3_SYNC_STATE_SAVE_EVERY || process.env.VIETNIX_S3_SYNC_STATE_SAVE_EVERY || '100',
        S3_SYNC_STATE_SAVE_INTERVAL_MS: process.env.S3_SYNC_STATE_SAVE_INTERVAL_MS || process.env.VIETNIX_S3_SYNC_STATE_SAVE_INTERVAL_MS || '10000'
      } : {})
    };
    const publishStorage = process.env.PRODUCTION_PUBLISH_CATALOG_STORAGE || process.env.CATALOG_STORAGE || process.env.CATALOG_STORAGE_MODE || '';
    if (publishStorage) {
      env.CATALOG_STORAGE = publishStorage;
      env.CATALOG_STORAGE_MODE = publishStorage;
    }
    const child = spawn(bin, args, {
      cwd: ROOT,
      env,
      shell: false,
      windowsHide: true
    });
    let output = '';
    const collect = (chunk) => {
      const text = chunk.toString('utf8');
      output = trimLog(`${output}${text}`);
      if (onOutput) onOutput(text);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (error) => {
      resolve({ exitCode: 1, output: cleanLog(error?.message || 'Cannot start command.') });
    });
    child.on('close', (exitCode, signal) => {
      resolve({ exitCode: exitCode ?? (signal ? 1 : 0), output: cleanLog(output.trim()) });
    });
  });
}

function handleStepOutput(job, step, text) {
  const lines = String(text || '').split(/\r?\n/).map((line) => cleanLog(line.trim())).filter(Boolean);
  if (!lines.length) return;
  step.output = trimLog(`${step.output || ''}\n${lines.join('\n')}`.trim());
  for (const line of lines) {
    const progress = parseS3ProgressLine(line);
    if (progress) step.progress = progress;
    if (/^\[s3-sync\]/.test(line)) appendLog(job, line);
  }
  touch(job);
}

function parseS3ProgressLine(line) {
  const progress = String(line || '').match(/^\[s3-sync\]\s+(progress|done)\s+checked=(\d+)\/(\d+)\s+uploaded=(\d+)\s+skipped=(\d+)(?:\s+cached=(\d+))?(?:\s+failed=(\d+))?\s+rate=([\d.]+)\s+files\/min\s+eta=([^\s]+)\s+concurrency=(\d+)(?:\s+attempts=(\d+))?(?:\s+recovered=(\d+))?(?:\s+retryRound=(\d+))?/);
  if (progress) {
    return {
      phase: progress[1],
      checked: Number(progress[2]),
      total: Number(progress[3]),
      uploaded: Number(progress[4]),
      skipped: Number(progress[5]),
      cached: Number(progress[6] || 0),
      failed: Number(progress[7] || 0),
      ratePerMinute: Number(progress[8]),
      eta: progress[9],
      concurrency: Number(progress[10]),
      failedAttempts: Number(progress[11] || 0),
      recovered: Number(progress[12] || 0),
      retryRound: Number(progress[13] || 0)
    };
  }
  const start = String(line || '').match(/^\[s3-sync\]\s+(\S+)\s+(\d+)\s+files\b.*\bconcurrency=(\d+)(?:\s+retryRounds=(\d+))?(?:\s+retryConcurrency=(\d+))?/);
  if (!start) return null;
  return {
    phase: start[1],
    checked: 0,
    total: Number(start[2]),
    uploaded: 0,
    skipped: 0,
    cached: 0,
    failed: 0,
    failedAttempts: 0,
    recovered: 0,
    ratePerMinute: 0,
    eta: 'dang-tinh',
    concurrency: Number(start[3]),
    retryRounds: Number(start[4] || 0),
    retryConcurrency: Number(start[5] || 0)
  };
}

function touch(job) {
  job.updatedAt = new Date().toISOString();
}

function appendLog(job, line) {
  job.logs.push({
    at: new Date().toISOString(),
    text: cleanLog(line)
  });
  if (job.logs.length > MAX_LOG_LINES) job.logs.splice(0, job.logs.length - MAX_LOG_LINES);
}

function publicJob(job) {
  return {
    id: job.id,
    seriesId: job.seriesId,
    seriesSlug: job.seriesSlug,
    title: job.title,
    status: job.status,
    stepIndex: job.stepIndex,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    logs: job.logs,
    storage: job.storage || catalogStorageSummary(),
    steps: job.steps.map(({ command, s3Step, ...step }) => step),
    requestedSteps: job.requestedSteps || [],
    result: job.result
  };
}

function trimLog(value) {
  const text = String(value || '');
  if (text.length <= MAX_LOG_TEXT) return text;
  return text.slice(text.length - MAX_LOG_TEXT);
}

function cleanLog(value) {
  let text = trimLog(value);
  for (const key of [
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'LIBSQL_AUTH_TOKEN',
    'ADMIN_PASSWORD',
    'ADMIN_TOKEN'
  ]) {
    const secret = process.env[key];
    if (secret) text = text.split(secret).join(`[redacted:${key}]`);
  }
  return text;
}
