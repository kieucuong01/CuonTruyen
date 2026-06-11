import { buildAdminImportPayload } from './adminPayloads.mjs';
import {
  importJobsFlashMessage,
  importJobsFromResult
} from './adminJobHelpers.mjs';

export function createAdminImportActions({
  adminHeaders,
  app,
  clearControlPending,
  fetchJson,
  formDataFactory = (form) => new FormData(form),
  invalidateContentCache,
  pollImportJob,
  renderAdmin,
  setAdminFlashMessage,
  setControlPending,
  splitList
} = {}) {
  async function handleImport(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const status = app.querySelector('[data-status]');
    const button = form.querySelector('button[type="submit"]');
    const formData = formDataFactory(form);
    const payload = buildAdminImportPayload(formData, { splitList });
    const urls = payload.urls;
    if (!urls.length) {
      if (status) {
        status.className = 'status-line error';
        status.textContent = 'Vui long nhap URL truyen hop le.';
      }
      return;
    }

    setControlPending(button);
    if (status) {
      status.className = 'status-line';
      status.textContent = urls.length > 1 ? `Dang tao ${urls.length} job crawl...` : 'Dang tao job crawl...';
    }

    try {
      const result = await fetchJson('/api/admin/import-jobs', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify(payload)
      });
      const jobs = importJobsFromResult(result);
      if (!jobs.length) throw new Error('Khong tao duoc job crawl.');
      if (jobs.length === 1) {
        const series = await pollImportJob(jobs[0].job.id, status, { navigateOnComplete: false });
        setAdminFlashMessage(importJobsFlashMessage(jobs, series));
      } else {
        if (status) status.textContent = `Đã tạo ${jobs.length} job crawl. Theo dõi trong bảng Trạng thái crawl.`;
        setAdminFlashMessage(`Đã tạo ${jobs.length} job crawl.`);
      }
      invalidateContentCache();
      await renderAdmin();
    } catch (error) {
      if (status) {
        status.className = 'status-line error';
        status.textContent = error.message;
      }
    } finally {
      clearControlPending();
    }
  }

  return {
    handleImport
  };
}
