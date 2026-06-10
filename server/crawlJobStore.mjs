import {
  ensurePostgresSchema,
  queryPostgres,
  withPostgresTransaction
} from './postgresStore.mjs';
import {
  ACTIVE_JOB_STATUSES,
  createQueuedImportJob,
  nextRetryAt,
  normalizeSourceUrl,
  publicJob
} from './crawlQueue.mjs';

const DEFAULT_RUNNING_JOB_STALE_MS = 20 * 60 * 1000;

export async function ensureCrawlQueueStorage() {
  await ensurePostgresSchema();
  return 'postgres';
}

export async function createImportJob(payload, options = {}) {
  await ensureCrawlQueueStorage();
  const runningJob = await getRunningImportJobForUrl(payload.url);
  if (runningJob) return { job: runningJob, reused: true };
  const job = createQueuedImportJob(payload, options);
  await insertPostgresJob(job);
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
  const result = await queryPostgres('select * from crawl_jobs where id = $1', [id]);
  return publicJob(jobFromRow(result.rows[0]));
}

export async function listImportJobs({ limit = 50 } = {}) {
  await ensureCrawlQueueStorage();
  const result = await queryPostgres(
    'select * from crawl_jobs order by created_at desc limit $1',
    [Math.max(1, Math.min(200, Number(limit || 50)))]
  );
  return result.rows.map(jobFromRow).map(publicJob);
}

export async function getRunningImportJobForUrl(url) {
  await ensureCrawlQueueStorage();
  const sourceUrl = normalizeSourceUrl(url);
  const result = await queryPostgres(
    `select * from crawl_jobs
     where source_url = $1 and status = any($2::text[])
     order by created_at asc
     limit 1`,
    [sourceUrl, [...ACTIVE_JOB_STATUSES]]
  );
  return publicJob(jobFromRow(result.rows[0]));
}

export async function claimNextImportJob({ workerId = 'worker', now = new Date().toISOString() } = {}) {
  await ensureCrawlQueueStorage();
  return claimNextPostgresJob(workerId, now);
}

export async function resetStaleRunningImportJobs({
  now = new Date().toISOString(),
  staleMs = Number(process.env.CRAWL_RUNNING_JOB_STALE_MS || DEFAULT_RUNNING_JOB_STALE_MS)
} = {}) {
  await ensureCrawlQueueStorage();
  const thresholdMs = Date.parse(now) - Math.max(60_000, Number(staleMs || DEFAULT_RUNNING_JOB_STALE_MS));
  const message = 'Reset stale running job to retrying before worker claim.';
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
  const deadOwnerRows = await queryPostgres(
    `select id, locked_by from crawl_jobs
     where status = 'running'
       and locked_by is not null`
  );
  const deadOwnerIds = deadOwnerRows.rows
    .filter((row) => isJobLockOwnerDead(row.locked_by))
    .map((row) => row.id);
  if (!deadOwnerIds.length) return result.rows.length;

  const deadOwnerMessage = 'Reset running job locked by a dead worker.';
  const deadOwnerResult = await queryPostgres(
    `update crawl_jobs
     set status = 'retrying',
         progress = progress || $2::jsonb,
         logs = logs || $3::jsonb,
         run_after = $4,
         updated_at = $4,
         locked_by = null,
         locked_at = null,
         last_error = null
     where id = any($1::text[])
     returning id`,
    [
      deadOwnerIds,
      JSON.stringify({ phase: 'retrying', message: deadOwnerMessage, updatedAt: now }),
      JSON.stringify([jobLog(deadOwnerMessage, now)]),
      now
    ]
  );
  return result.rows.length + deadOwnerResult.rows.length;
}

export async function updateImportJobProgress(id, patch = {}, { log = null, now = new Date().toISOString(), workerId = '' } = {}) {
  await ensureCrawlQueueStorage();
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
  const result = await queryPostgres('select * from crawl_jobs where id = $1', [id]);
  return jobFromRow(result.rows[0]);
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

function iso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
