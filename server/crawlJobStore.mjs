import fs from 'node:fs/promises';
import path from 'node:path';

import { IMPORT_ROOT } from './catalogStore.mjs';
import {
  ensurePostgresSchema,
  queryPostgres,
  usesPostgresStorage,
  withPostgresTransaction
} from './postgresStore.mjs';
import {
  ACTIVE_JOB_STATUSES,
  createQueuedImportJob,
  mergeProgress,
  nextRetryAt,
  normalizeSourceUrl,
  publicJob,
  shouldReuseActiveJob
} from './crawlQueue.mjs';

const DEFAULT_JSON_QUEUE_PATH = path.join(IMPORT_ROOT, 'crawl-jobs.json');
const JSON_READ_RETRY_COUNT = 3;
const JSON_WRITE_RETRY_COUNT = 8;
const DEFAULT_RUNNING_JOB_STALE_MS = 20 * 60 * 1000;
let jsonWriteQueue = Promise.resolve();
let lastJsonJobsSnapshot = [];

export async function ensureCrawlQueueStorage() {
  if (usesPostgresStorage()) {
    await ensurePostgresSchema();
    return 'postgres';
  }
  await fs.mkdir(path.dirname(jsonQueuePath()), { recursive: true });
  try {
    await fs.access(jsonQueuePath());
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.writeFile(jsonQueuePath(), `${JSON.stringify({ jobs: [] }, null, 2)}\n`);
  }
  return 'json';
}

export async function createImportJob(payload, options = {}) {
  await ensureCrawlQueueStorage();
  const runningJob = await getRunningImportJobForUrl(payload.url);
  if (runningJob) return { job: runningJob, reused: true };
  const job = createQueuedImportJob(payload, options);
  if (usesPostgresStorage()) await insertPostgresJob(job);
  else await writeJsonJobs([...(await readJsonJobs()), job]);
  return { job: publicJob(job), reused: false };
}

export async function createImportJobs(payloads, options = {}) {
  const batchId = options.batchId || `batch-${Date.now().toString(36)}`;
  const totalSeries = payloads.length;
  const jobs = [];
  for (const [index, payload] of payloads.entries()) {
    const result = await createImportJob({
      ...payload,
      batchId,
      totalSeries,
      seriesIndex: index + 1
    }, {
      reason: payload.reason || options.reason || 'manual',
      priority: payload.priority ?? options.priority ?? 0
    });
    jobs.push(result);
  }
  return jobs;
}

export async function getImportJob(id) {
  await ensureCrawlQueueStorage();
  if (usesPostgresStorage()) {
    const result = await queryPostgres('select * from crawl_jobs where id = $1', [id]);
    return publicJob(jobFromRow(result.rows[0]));
  }
  return publicJob((await readJsonJobs()).find((job) => job.id === id));
}

export async function listImportJobs({ limit = 50 } = {}) {
  await ensureCrawlQueueStorage();
  if (usesPostgresStorage()) {
    const result = await queryPostgres(
      'select * from crawl_jobs order by created_at desc limit $1',
      [Math.max(1, Math.min(200, Number(limit || 50)))]
    );
    return result.rows.map(jobFromRow).map(publicJob);
  }
  return (await readJsonJobs())
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
    .slice(0, Math.max(1, Math.min(200, Number(limit || 50))))
    .map(publicJob);
}

export async function getRunningImportJobForUrl(url) {
  await ensureCrawlQueueStorage();
  const sourceUrl = normalizeSourceUrl(url);
  if (usesPostgresStorage()) {
    const result = await queryPostgres(
      `select * from crawl_jobs
       where source_url = $1 and status = any($2::text[])
       order by created_at asc
       limit 1`,
      [sourceUrl, [...ACTIVE_JOB_STATUSES]]
    );
    return publicJob(jobFromRow(result.rows[0]));
  }
  return publicJob((await readJsonJobs()).find((job) => shouldReuseActiveJob(job, sourceUrl)));
}

export async function claimNextImportJob({ workerId = 'worker', now = new Date().toISOString() } = {}) {
  await ensureCrawlQueueStorage();
  if (usesPostgresStorage()) return claimNextPostgresJob(workerId, now);
  const jobs = await readJsonJobs();
  const next = jobs
    .filter((job) => ['queued', 'retrying'].includes(job.status) && Date.parse(job.runAfter || 0) <= Date.parse(now))
    .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0) || Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0))[0];
  if (!next) return null;
  const index = jobs.findIndex((job) => job.id === next.id);
  const updated = {
    ...next,
    status: 'running',
    attempts: Number(next.attempts || 0) + 1,
    lockedBy: workerId,
    lockedAt: now,
    startedAt: next.startedAt || now,
    updatedAt: now,
    progress: mergeProgress(next, {
      phase: 'running',
      message: 'Worker đã nhận job, bắt đầu crawl.'
    }, now)
  };
  jobs[index] = updated;
  await writeJsonJobs(jobs);
  return publicJob(updated);
}

export async function resetStaleRunningImportJobs({
  now = new Date().toISOString(),
  staleMs = Number(process.env.CRAWL_RUNNING_JOB_STALE_MS || DEFAULT_RUNNING_JOB_STALE_MS)
} = {}) {
  await ensureCrawlQueueStorage();
  const thresholdMs = Date.parse(now) - Math.max(60_000, Number(staleMs || DEFAULT_RUNNING_JOB_STALE_MS));
  const message = 'Reset stale running job to retrying before worker claim.';
  if (usesPostgresStorage()) {
    const result = await queryPostgres(
      `update crawl_jobs
       set status = 'retrying',
           progress = progress || $2::jsonb,
           logs = logs || $3::jsonb,
           run_after = $4,
           updated_at = $4,
           locked_by = null,
           locked_at = null,
           last_error = null
       where status = 'running'
         and extract(epoch from coalesce(locked_at, updated_at, started_at, created_at)) * 1000 < $1
       returning id`,
      [
        thresholdMs,
        JSON.stringify({ phase: 'retrying', message, updatedAt: now }),
        JSON.stringify([jobLog(message, now)]),
        now
      ]
    );
    return result.rows.length;
  }

  let resetCount = 0;
  await updateJsonJobs((jobs) => jobs.map((job) => {
    if (job.status !== 'running') return job;
    const lastActiveAt = Date.parse(job.lockedAt || job.updatedAt || job.startedAt || job.createdAt || 0);
    const ownerIsDead = isJobLockOwnerDead(job.lockedBy);
    if (!ownerIsDead && (!lastActiveAt || lastActiveAt >= thresholdMs)) return job;
    resetCount += 1;
    return {
      ...job,
      status: 'retrying',
      runAfter: now,
      lockedBy: null,
      lockedAt: null,
      lastError: null,
      error: null,
      progress: mergeProgress(job, {
        phase: 'retrying',
        message,
        updatedAt: now
      }, now),
      logs: [...(job.logs || []), jobLog(message, now)]
    };
  }));
  return resetCount;
}

export async function updateImportJobProgress(id, patch = {}, { log = null, now = new Date().toISOString(), workerId = '' } = {}) {
  await ensureCrawlQueueStorage();
  if (usesPostgresStorage()) {
    const logsPatch = log ? [jobLog(log, now)] : [];
    if (workerId) {
      const result = await queryPostgres(
        `update crawl_jobs
         set progress = progress || $2::jsonb,
             logs = logs || $3::jsonb,
             updated_at = $4,
             locked_at = $4,
             locked_by = coalesce(locked_by, $5),
             started_at = coalesce(started_at, $4),
             status = case
               when status in ('queued', 'retrying') and locked_by is null then 'running'
               else status
             end
         where id = $1
           and status = any($6::text[])
           and (locked_by = $5 or locked_by is null)
         returning *`,
        [id, JSON.stringify({ ...patch, updatedAt: now }), JSON.stringify(logsPatch), now, workerId, ['running', 'queued', 'retrying']]
      );
      return publicJob(jobFromRow(result.rows[0]));
    }
    const result = await queryPostgres(
      `update crawl_jobs
       set progress = progress || $2::jsonb,
           logs = logs || $3::jsonb,
           updated_at = $4
       where id = $1
       returning *`,
      [id, JSON.stringify({ ...patch, updatedAt: now }), JSON.stringify(logsPatch), now]
    );
    return publicJob(jobFromRow(result.rows[0]));
  }
  return updateJsonJob(id, (job) => {
    const ownership = resolveProgressOwnership(job, workerId, now);
    if (ownership.blocked) return job;
    return {
      ...job,
      ...ownership.fields,
      progress: mergeProgress(job, patch, now),
      logs: log ? [...(job.logs || []), jobLog(log, now)] : job.logs || [],
      updatedAt: now
    };
  });
}

export async function completeImportJob(id, series, { now = new Date().toISOString() } = {}) {
  await ensureCrawlQueueStorage();
  const current = await getInternalJob(id);
  const storedSeries = compactSeriesForJob(series);
  const totalSeries = Number(current?.progress?.totalSeries || 1);
  const seriesIndex = Number(current?.progress?.seriesIndex || 1);
  const importSummary = series?.importSummary || {};
  const newChapterCount = Number(importSummary.newChapterCount || 0);
  const mode = importSummary.mode || current?.payload?.mode || 'full';
  const message = mode === 'new-chapters'
    ? (newChapterCount > 0
      ? `Đã cập nhật ${newChapterCount} chapter mới cho ${series.title}.`
      : `Chưa có chapter mới cho ${series.title}.`)
    : `Đã crawl xong ${series.title}.`;
  const progressPatch = {
    phase: mode === 'new-chapters' && newChapterCount === 0 ? 'completed-no-new-chapters' : 'completed',
    message,
    mode,
    newChapterCount,
    skippedExistingChapterCount: Number(importSummary.skippedExistingChapterCount || current?.progress?.skippedExistingChapterCount || 0),
    processedSeries: Math.min(totalSeries, seriesIndex),
    updatedAt: now
  };
  if (usesPostgresStorage()) {
    const result = await queryPostgres(
      `update crawl_jobs
       set status = 'completed',
           result = $2::jsonb,
           series_id = $3,
           progress = progress || $4::jsonb,
           finished_at = $5,
           updated_at = $5,
           locked_by = null,
           locked_at = null,
           last_error = null
       where id = $1
       returning *`,
      [id, JSON.stringify({ series: storedSeries }), series.id, JSON.stringify(progressPatch), now]
    );
    return publicJob(jobFromRow(result.rows[0]));
  }
  return updateJsonJob(id, (job) => ({
    ...job,
    status: 'completed',
    result: { series: storedSeries },
    series: storedSeries,
    error: null,
    progress: mergeProgress(job, progressPatch, now),
    finishedAt: now,
    updatedAt: now,
    lockedBy: null,
    lockedAt: null
  }));
}

export async function failImportJob(id, error, { now = new Date().toISOString(), retry = true } = {}) {
  await ensureCrawlQueueStorage();
  const message = error?.message || String(error || 'Import failed');
  const current = await getInternalJob(id);
  if (!current) return null;
  const attempts = Number(current.attempts || 0);
  const maxAttempts = Number(current.maxAttempts || 1);
  const shouldRetry = retry && attempts < maxAttempts;
  const status = shouldRetry ? 'retrying' : 'failed';
  const runAfter = shouldRetry ? nextRetryAt({ attempts }, Date.parse(now)) : current.runAfter;
  const progressPatch = {
    phase: status,
    message: shouldRetry
      ? `Lỗi: ${message}. Sẽ retry job lần ${attempts + 1}/${maxAttempts}.`
      : message,
    errors: [...(current.progress?.errors || []), message].slice(-20),
    errorCount: Number(current.progress?.errorCount || 0) + 1,
    updatedAt: now
  };

  if (usesPostgresStorage()) {
    const result = await queryPostgres(
      `update crawl_jobs
       set status = $2,
           progress = progress || $3::jsonb,
           logs = logs || $4::jsonb,
           run_after = $5,
           finished_at = case when $2 = 'failed' then $6 else finished_at end,
           updated_at = $6,
           locked_by = null,
           locked_at = null,
           last_error = $7
       where id = $1
       returning *`,
      [id, status, JSON.stringify(progressPatch), JSON.stringify([jobLog(message, now, 'error')]), runAfter, now, message]
    );
    return publicJob(jobFromRow(result.rows[0]));
  }
  return updateJsonJob(id, (job) => ({
    ...job,
    status,
    error: message,
    lastError: message,
    runAfter,
    progress: mergeProgress(job, progressPatch, now),
    logs: [...(job.logs || []), jobLog(message, now, 'error')],
    finishedAt: status === 'failed' ? now : job.finishedAt,
    updatedAt: now,
    lockedBy: null,
    lockedAt: null
  }));
}

async function claimNextPostgresJob(workerId, now) {
  const job = await withPostgresTransaction(async (client) => {
    const result = await client.query(
      `select * from crawl_jobs
       where status = any($1::text[]) and run_after <= $2
       order by priority desc, created_at asc
       limit 1
       for update skip locked`,
      [['queued', 'retrying'], now]
    );
    const row = result.rows[0];
    if (!row) return null;
    const updated = await client.query(
      `update crawl_jobs
       set status = 'running',
           attempts = attempts + 1,
           locked_by = $2,
           locked_at = $3,
           started_at = coalesce(started_at, $3),
           progress = progress || $4::jsonb,
           updated_at = $3
       where id = $1
       returning *`,
      [row.id, workerId, now, JSON.stringify({
        phase: 'running',
        message: 'Worker đã nhận job, bắt đầu crawl.',
        updatedAt: now
      })]
    );
    return updated.rows[0];
  });
  return publicJob(jobFromRow(job));
}

async function insertPostgresJob(job) {
  await queryPostgres(
    `insert into crawl_jobs (
      id, source_url, adapter, status, payload, progress, logs, result,
      series_id, reason, priority, attempts, max_attempts, run_after,
      locked_by, locked_at, last_error, started_at, finished_at, created_at, updated_at
    ) values (
      $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb,
      $9, $10, $11, $12, $13, $14,
      $15, $16, $17, $18, $19, $20, $21
    )`,
    [
      job.id,
      job.sourceUrl,
      job.adapter,
      job.status,
      JSON.stringify(job.payload),
      JSON.stringify(job.progress),
      JSON.stringify(job.logs),
      JSON.stringify(job.result || {}),
      job.series?.id || null,
      job.reason,
      job.priority,
      job.attempts,
      job.maxAttempts,
      job.runAfter,
      job.lockedBy,
      job.lockedAt,
      job.lastError || job.error,
      job.startedAt,
      job.finishedAt,
      job.createdAt,
      job.updatedAt
    ]
  );
}

function resolveProgressOwnership(job = {}, workerId = '', now = new Date().toISOString()) {
  if (!workerId) return { fields: {} };
  if (job.status === 'running') {
    if (job.lockedBy && job.lockedBy !== workerId) return { blocked: true };
    return {
      fields: {
        lockedBy: job.lockedBy || workerId,
        lockedAt: now,
        startedAt: job.startedAt || now
      }
    };
  }
  if (['queued', 'retrying'].includes(job.status) && !job.lockedBy) {
    return {
      fields: {
        status: 'running',
        lockedBy: workerId,
        lockedAt: now,
        startedAt: job.startedAt || now,
        runAfter: job.runAfter || now
      }
    };
  }
  return { blocked: true };
}

async function getInternalJob(id) {
  if (usesPostgresStorage()) {
    const result = await queryPostgres('select * from crawl_jobs where id = $1', [id]);
    return jobFromRow(result.rows[0]);
  }
  return (await readJsonJobs()).find((job) => job.id === id) || null;
}

async function updateJsonJob(id, updater) {
  let updatedJob = null;
  await updateJsonJobs((jobs) => {
    const index = jobs.findIndex((job) => job.id === id);
    if (index < 0) return jobs;
    const nextJobs = [...jobs];
    updatedJob = updater(nextJobs[index]);
    nextJobs[index] = updatedJob;
    return nextJobs;
  });
  return updatedJob ? publicJob(updatedJob) : null;
}

async function updateJsonJobs(updater) {
  const jobs = await readJsonJobs();
  const updatedJobs = updater(jobs);
  await writeJsonJobs(updatedJobs);
  return updatedJobs;
}

async function readJsonJobs() {
  await ensureCrawlQueueStorage();
  for (let attempt = 0; attempt <= JSON_READ_RETRY_COUNT; attempt += 1) {
    try {
      const value = JSON.parse(await fs.readFile(jsonQueuePath(), 'utf8'));
      const jobs = Array.isArray(value.jobs) ? value.jobs : [];
      lastJsonJobsSnapshot = jobs;
      return jobs;
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      if (!(error instanceof SyntaxError) && !isRetryableJsonFileError(error)) throw error;
      if (attempt < JSON_READ_RETRY_COUNT) {
        await delay(25 * (attempt + 1));
        continue;
      }
      if (lastJsonJobsSnapshot.length) return lastJsonJobsSnapshot;
      throw error;
    }
  }
  return lastJsonJobsSnapshot;
}

function writeJsonJobs(jobs) {
  const pending = jsonWriteQueue.then(async () => {
    const nextJobs = jobs.map(compactJobForStorage);
    const queuePath = jsonQueuePath();
    await fs.mkdir(IMPORT_ROOT, { recursive: true });
    await fs.mkdir(path.dirname(queuePath), { recursive: true });
    await writeJsonAtomic(queuePath, `${JSON.stringify({ jobs: nextJobs }, null, 2)}\n`);
    lastJsonJobsSnapshot = nextJobs;
  });
  jsonWriteQueue = pending.catch(() => {});
  return pending;
}

async function writeJsonAtomic(filePath, contents) {
  for (let attempt = 0; attempt <= JSON_WRITE_RETRY_COUNT; attempt += 1) {
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.${attempt}.tmp`;
    try {
      await fs.writeFile(tempPath, contents);
      await fs.rename(tempPath, filePath);
      return;
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => {});
      if (!isRetryableJsonFileError(error) || attempt >= JSON_WRITE_RETRY_COUNT) throw error;
      await delay(75 * (attempt + 1));
    }
  }
}

function isRetryableJsonFileError(error) {
  return ['EBUSY', 'EACCES', 'EPERM'].includes(error?.code);
}

function isJobLockOwnerDead(lockedBy = '') {
  const match = String(lockedBy || '').match(/(?:^|-)worker-(\d+)$/);
  if (!match) return false;
  const pid = Number(match[1]);
  if (!pid || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
}

function jsonQueuePath() {
  return process.env.CRAWL_QUEUE_PATH || DEFAULT_JSON_QUEUE_PATH;
}

function jobFromRow(row) {
  if (!row) return null;
  const result = row.result || {};
  return {
    id: row.id,
    sourceUrl: row.source_url,
    adapter: row.adapter || '',
    status: row.status,
    payload: row.payload || {},
    progress: row.progress || {},
    logs: row.logs || [],
    result,
    series: result.series || null,
    error: row.last_error || null,
    lastError: row.last_error || null,
    reason: row.reason || '',
    priority: Number(row.priority || 0),
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 1),
    runAfter: iso(row.run_after),
    lockedBy: row.locked_by || null,
    lockedAt: iso(row.locked_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    startedAt: iso(row.started_at),
    finishedAt: iso(row.finished_at)
  };
}

function compactJobForStorage(job = {}) {
  const series = compactSeriesForJob(job.series || job.result?.series);
  return {
    ...job,
    result: job.result?.series ? { ...job.result, series } : job.result,
    series: series || job.series || null
  };
}

function compactSeriesForJob(series) {
  if (!series) return null;
  const chapters = Array.isArray(series.chapters) ? series.chapters : [];
  return {
    id: series.id,
    title: series.title,
    slug: series.slug,
    sourceUrl: series.sourceUrl,
    adapter: series.adapter,
    status: series.status,
    coverUrl: series.coverUrl,
    thumbnailUrl: series.thumbnailUrl,
    importSummary: series.importSummary || null,
    chapterCount: Number(series.chapterCount ?? chapters.length ?? 0),
    pageCount: Number(series.pageCount ?? chapters.reduce((sum, chapter) => (
      sum + Number(chapter.pageCount ?? (Array.isArray(chapter.pages) ? chapter.pages.length : 0))
    ), 0))
  };
}

function jobLog(message, timestamp, level = 'info') {
  return {
    at: timestamp,
    level,
    message: typeof message === 'string' ? message : message?.message || JSON.stringify(message)
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function iso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
