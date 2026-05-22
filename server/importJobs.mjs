import { importSeries } from './importer.mjs';

const jobs = new Map();
let nextJobId = 1;

function initialProgress() {
  return {
    phase: 'queued',
    message: 'Đã xếp hàng import.',
    totalChapters: 0,
    processedChapters: 0,
    totalImages: 0,
    downloadedImages: 0,
    currentChapterLabel: '',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    payload: job.payload,
    progress: job.progress,
    series: job.series || null,
    error: job.error || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  };
}

async function defaultRunner(payload, onProgress) {
  return importSeries(payload.url, {
    maxChapters: payload.maxChapters,
    maxPages: payload.maxPages
  }, onProgress);
}

export function createImportJob(payload, runner = defaultRunner) {
  const id = `import-${Date.now().toString(36)}-${nextJobId++}`;
  const job = {
    id,
    payload,
    status: 'running',
    progress: initialProgress(),
    series: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    done: null
  };
  jobs.set(id, job);

  const onProgress = (patch) => {
    job.progress = {
      ...job.progress,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    job.updatedAt = job.progress.updatedAt;
  };

  job.done = Promise.resolve()
    .then(() => runner(payload, onProgress))
    .then((series) => {
      job.status = 'completed';
      job.series = series;
      job.progress = {
        ...job.progress,
        phase: 'completed',
        message: `Đã import ${series.title}.`,
        totalChapters: job.progress.totalChapters || series.chapters?.length || 0,
        processedChapters: job.progress.totalChapters || job.progress.processedChapters,
        updatedAt: new Date().toISOString()
      };
      job.updatedAt = job.progress.updatedAt;
      return series;
    })
    .catch((error) => {
      job.status = 'failed';
      job.error = error.message || 'Import failed';
      job.progress = {
        ...job.progress,
        phase: 'failed',
        message: job.error,
        updatedAt: new Date().toISOString()
      };
      job.updatedAt = job.progress.updatedAt;
      throw error;
    });

  return job;
}

export function getImportJob(id) {
  const job = jobs.get(id);
  return job ? publicJob(job) : null;
}

export function getRunningImportJobForUrl(url) {
  const normalizedUrl = String(url || '').trim();
  for (const job of jobs.values()) {
    if (job.status === 'running' && String(job.payload.url || '').trim() === normalizedUrl) {
      return publicJob(job);
    }
  }
  return null;
}
