import { renderImportProgressView } from './adminImportProgressView.mjs';
import { renderProductionProgressView } from './adminProductionView.mjs';
import { resolveImportJobSeries } from './adminJobHelpers.mjs';

export function renderProductionProgressStatus(status, job) {
  if (!status) return;
  const view = renderProductionProgressView(job);
  status.className = view.className;
  status.innerHTML = view.html;
}

export function renderImportProgressStatus(status, job) {
  if (!status) return;
  const isAdminUpdateStatus = Boolean(status.hasAttribute && status.hasAttribute('data-update-chapters-status'));
  const view = renderImportProgressView(job, { isAdminUpdateStatus });
  status.className = view.className;
  status.innerHTML = view.html;
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

export function createAdminJobPollers({
  adminHeaders,
  fetchJson,
  importIntervalMs = 1500,
  navigateTo = (url) => {
    window.location.href = url;
  },
  productionIntervalMs = 1200,
  wait = delay
} = {}) {
  async function pollImportJob(jobId, status, { navigateOnComplete = false } = {}) {
    while (true) {
      const job = await fetchJson(`/api/admin/import-jobs/${encodeURIComponent(jobId)}`, {
        headers: adminHeaders()
      });
      renderImportProgressStatus(status, job);
      if (job.status === 'completed') {
        const series = resolveImportJobSeries(job);
        if (navigateOnComplete && series?.id) {
          navigateTo(`/admin/series/${encodeURIComponent(series.id)}`);
        }
        return series;
      }
      if (job.status === 'failed') {
        throw new Error(job.error || job.lastError || 'Import job failed.');
      }
      await wait(importIntervalMs);
    }
  }

  async function pollProductionJob(jobId, status) {
    while (true) {
      const job = await fetchJson(`/api/admin/production-jobs/${encodeURIComponent(jobId)}`, {
        headers: adminHeaders()
      });
      renderProductionProgressStatus(status, job);
      if (job.status === 'completed') return job;
      if (job.status === 'failed') throw new Error(job.error || 'Production workflow failed.');
      await wait(productionIntervalMs);
    }
  }

  return {
    pollImportJob,
    pollProductionJob
  };
}
