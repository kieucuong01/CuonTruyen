import './env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { IMPORT_ROOT } from './catalogStore.mjs';
import { importSeries } from './importer.mjs';
import { ensureStorageSchema, readCatalog } from './dataStore.mjs';
import { assertCatalogStorageReady } from './storageConfig.mjs';
import { setStoredCrawlSchedule } from './contentStore.mjs';
import {
  claimNextImportJob,
  completeImportJob,
  createImportJobs,
  ensureCrawlQueueStorage,
  failImportJob,
  resetStaleRunningImportJobs,
  updateImportJobProgress
} from './importJobs.mjs';
import { createScheduledCrawlPayloads, selectScheduledSeries } from './crawlQueue.mjs';

const DEFAULT_WORKER_ID = `crawl-worker-${process.pid}`;
const WORKER_LOCK_PATH = process.env.CRAWL_WORKER_LOCK_PATH || path.join(IMPORT_ROOT, 'crawl-worker.lock');
const WORKER_LOCK_STALE_MS = Math.max(60_000, Number(process.env.CRAWL_WORKER_LOCK_STALE_MS || 6 * 60 * 60 * 1000));
const WORKER_LOCK_HEARTBEAT_MS = Math.max(5_000, Number(process.env.CRAWL_WORKER_LOCK_HEARTBEAT_MS || 30_000));

export async function runWorkerOnce({
  workerId = DEFAULT_WORKER_ID,
  enqueueSchedules = false
} = {}) {
  assertCatalogStorageReady();
  return withWorkerLock(workerId, async () => {
    await ensureStorageSchema();
    await ensureCrawlQueueStorage();
    if (enqueueSchedules) await enqueueDueScheduledCrawls();
    if (process.env.CRAWL_RESET_STALE_RUNNING_JOBS !== 'false') {
      await resetStaleRunningImportJobs();
    }

    const job = await claimNextImportJob({ workerId });
    if (!job) return { claimed: false };
    await runClaimedImportJob(job, { workerId });
    return { claimed: true, jobId: job.id };
  });
}

export async function runClaimedImportJob(job, { workerId = DEFAULT_WORKER_ID } = {}) {
  void workerId;
  try {
    const payload = job.payload || {};
    const series = await importSeries(payload.url, {
      mode: payload.mode,
      seriesId: payload.seriesId,
      publishNewChapters: payload.publishNewChapters,
      maxChapters: payload.maxChapters,
      maxPages: payload.maxPages,
      imageRetries: Number(payload.imageRetries ?? process.env.CRAWL_IMAGE_RETRIES ?? 2),
      imageConcurrency: Number(payload.imageConcurrency ?? process.env.CRAWL_IMAGE_CONCURRENCY ?? 4),
      imageDomainDelayMs: Number(payload.imageDomainDelayMs ?? process.env.CRAWL_IMAGE_DOMAIN_DELAY_MS ?? 80),
      optimizeDuringCrawl: payload.optimizeDuringCrawl ?? process.env.CRAWL_OPTIMIZE_DURING_CRAWL === 'true',
      domainDelayMs: Number(payload.domainDelayMs ?? process.env.CRAWL_DOMAIN_DELAY_MS ?? 650)
    }, (patch) => updateImportJobProgress(job.id, patch, { workerId }));
    await completeImportJob(job.id, series);
    return series;
  } catch (error) {
    await failImportJob(job.id, error);
    console.error(`[crawl-worker] job ${job.id} failed: ${error.message}`);
    return null;
  }
}

export async function enqueueDueScheduledCrawls({
  hotAuto = process.env.CRAWL_HOT_AUTO === 'true',
  now = Date.now()
} = {}) {
  const catalog = await readCatalog({ includePages: false });
  const candidates = selectScheduledSeries(catalog, {
    hotAuto,
    now,
    hotMinScore: Number(process.env.CRAWL_HOT_MIN_SCORE || 1000),
    hotLimit: Number(process.env.CRAWL_HOT_LIMIT || 10)
  });
  if (!candidates.length) return [];

  const payloads = createScheduledCrawlPayloads(candidates);

  const jobs = await createImportJobs(payloads, {
    reason: 'scheduled',
    priority: 5,
    batchId: `schedule-${Date.now().toString(36)}`
  });

  const queuedAt = new Date(now).toISOString();
  await Promise.all(candidates.map(async ({ series }, index) => {
    if (jobs[index]?.reused) return;
    const schedule = {
      ...(series.crawlSchedule || {}),
      lastQueuedAt: queuedAt
    };
    await setStoredCrawlSchedule(series.id, schedule);
  }));

  return jobs;
}

export async function startWorkerLoop({
  workerId = DEFAULT_WORKER_ID,
  pollIntervalMs = Number(process.env.CRAWL_WORKER_POLL_MS || 2_000),
  scheduleScanMs = Number(process.env.CRAWL_SCHEDULE_SCAN_MS || 60_000)
} = {}) {
  assertCatalogStorageReady();
  let stopping = false;
  let nextScheduleScanAt = 0;
  const stop = () => {
    stopping = true;
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  console.log(`[crawl-worker] started ${workerId}`);
  while (!stopping) {
    const now = Date.now();
    const enqueueSchedules = now >= nextScheduleScanAt;
    if (enqueueSchedules) nextScheduleScanAt = now + scheduleScanMs;
    try {
      const result = await runWorkerOnce({ workerId, enqueueSchedules });
      if (!result.claimed) await delay(pollIntervalMs);
    } catch (error) {
      console.error(`[crawl-worker] ${error.message}`);
      await delay(pollIntervalMs);
    }
  }
  console.log(`[crawl-worker] stopped ${workerId}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(250, Number(ms || 0))));
}

async function withWorkerLock(workerId, callback) {
  if (process.env.CRAWL_WORKER_LOCK_DISABLED === 'true') return callback();
  const lock = await acquireWorkerLock(workerId);
  if (!lock) return { claimed: false, locked: true };
  try {
    return await callback();
  } finally {
    await lock.release();
  }
}

export async function acquireWorkerLock(workerId) {
  await fs.mkdir(path.dirname(WORKER_LOCK_PATH), { recursive: true });
  const startedAt = new Date().toISOString();
  const payload = () => JSON.stringify({
    workerId,
    pid: process.pid,
    startedAt,
    updatedAt: new Date().toISOString()
  }, null, 2);
  try {
    await fs.writeFile(WORKER_LOCK_PATH, payload(), { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const isStale = await isWorkerLockStale();
    if (!isStale) return null;
    await fs.rm(WORKER_LOCK_PATH, { force: true }).catch(() => {});
    try {
      await fs.writeFile(WORKER_LOCK_PATH, payload(), { flag: 'wx' });
    } catch (retryError) {
      if (retryError.code === 'EEXIST') return null;
      throw retryError;
    }
  }

  const heartbeat = setInterval(() => {
    fs.writeFile(WORKER_LOCK_PATH, payload()).catch(() => {});
  }, WORKER_LOCK_HEARTBEAT_MS);
  heartbeat.unref?.();
  return {
    release: async () => {
      clearInterval(heartbeat);
      await fs.rm(WORKER_LOCK_PATH, { force: true }).catch(() => {});
    }
  };
}

async function isWorkerLockStale() {
  try {
    const stat = await fs.stat(WORKER_LOCK_PATH);
    const lock = await readWorkerLock();
    if (lock?.pid && !isProcessAlive(lock.pid)) return true;
    return Date.now() - stat.mtimeMs > WORKER_LOCK_STALE_MS;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
}

async function readWorkerLock() {
  try {
    return JSON.parse(await fs.readFile(WORKER_LOCK_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  const processId = Number(pid || 0);
  if (!processId || processId === process.pid) return true;
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startWorkerLoop().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
