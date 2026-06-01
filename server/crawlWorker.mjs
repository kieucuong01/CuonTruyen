import { pathToFileURL } from 'node:url';

import { importSeries } from './importer.mjs';
import { ensureStorageSchema, readCatalog } from './dataStore.mjs';
import { setStoredCrawlSchedule } from './contentStore.mjs';
import {
  claimNextImportJob,
  completeImportJob,
  createImportJobs,
  ensureCrawlQueueStorage,
  failImportJob,
  updateImportJobProgress
} from './importJobs.mjs';
import { createScheduledCrawlPayloads, selectScheduledSeries } from './crawlQueue.mjs';

const DEFAULT_WORKER_ID = `crawl-worker-${process.pid}`;

export async function runWorkerOnce({
  workerId = DEFAULT_WORKER_ID,
  enqueueSchedules = false
} = {}) {
  await ensureStorageSchema();
  await ensureCrawlQueueStorage();
  if (enqueueSchedules) await enqueueDueScheduledCrawls();

  const job = await claimNextImportJob({ workerId });
  if (!job) return { claimed: false };
  await runClaimedImportJob(job, { workerId });
  return { claimed: true, jobId: job.id };
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
      domainDelayMs: Number(payload.domainDelayMs ?? process.env.CRAWL_DOMAIN_DELAY_MS ?? 650)
    }, (patch) => updateImportJobProgress(job.id, patch));
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startWorkerLoop().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
