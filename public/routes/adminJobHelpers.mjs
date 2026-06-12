export function importJobsFromResult(result = {}) {
  if (Array.isArray(result.jobs)) return result.jobs;
  if (result.job) return [{ job: result.job, reused: result.reused }];
  return [];
}

export function importJobsFlashMessage(jobs = [], series = {}) {
  if (jobs.length === 1) return `Da crawl xong ${series.title || 'truyen'}.`;
  return `Đã tạo ${jobs.length} job crawl.`;
}

export function updateChaptersFlashMessage(series = {}) {
  const summary = series.importSummary || {};
  const count = Number(summary.newChapterCount || 0);
  return count > 0
    ? `Đã thêm ${count} chapter mới cho ${series.title}.`
    : `Chưa có chapter mới cho ${series.title}.`;
}

export function refreshImageUrlsFlashMessage(series = {}) {
  const summary = series.importSummary || {};
  const refreshed = Number(summary.refreshedExistingChapterCount || 0);
  const added = Number(summary.newChapterCount || 0);
  return `Đã refresh URL ảnh cho ${refreshed} chapter${added ? ` và thêm ${added} chapter mới` : ''}. Hãy kiểm tra reader local rồi bấm Sync DB để cập nhật production.`;
}

export function resolveImportJobSeries(job = {}) {
  return job.result?.series || job.series || job.result || {};
}

export function parseProductionSteps(value = '') {
  return String(value || '')
    .split(',')
    .map((step) => step.trim())
    .filter(Boolean);
}
