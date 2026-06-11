import {
  refreshImageUrlsFlashMessage,
  updateChaptersFlashMessage
} from './adminJobHelpers.mjs';

export function createAdminSeriesJobActions({
  adminHeaders,
  app,
  cssEscape = (value) => CSS.escape(value),
  fetchJson,
  invalidateContentCache,
  pollImportJob,
  renderAdmin,
  renderAdminSeriesDetail,
  setAdminFlashMessage
} = {}) {
  async function handleUpdateChapters(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const seriesId = button.dataset.updateChapters;
    const status = app.querySelector(`[data-update-chapters-status="${cssEscape(seriesId)}"]`);
    button.disabled = true;
    button.textContent = 'Đang cập nhật...';
    if (status) {
      status.className = 'status-line admin-wide admin-update-status';
      status.textContent = 'Đang tạo job cập nhật chapter mới...';
    }

    try {
      const result = await fetchJson(`/api/admin/series/${encodeURIComponent(seriesId)}/update-chapters`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({})
      });
      if (result.reused && status) status.textContent = 'Truyện này đang có job crawl, đang theo dõi job hiện tại...';
      const series = await pollImportJob(result.job.id, status, { navigateOnComplete: false });
      setAdminFlashMessage(updateChaptersFlashMessage(series));
      invalidateContentCache();
      await renderAdmin();
    } catch (error) {
      if (status) {
        status.className = 'status-line admin-wide admin-update-status error';
        status.textContent = error.message;
      }
      button.disabled = false;
      button.textContent = 'Cập nhật chapter mới';
    }
  }

  async function handleRefreshImageUrls(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const seriesId = button.dataset.refreshImageUrls;
    const status = app.querySelector(`[data-update-chapters-status="${cssEscape(seriesId)}"]`);
    button.disabled = true;
    button.textContent = 'Đang refresh...';
    if (status) {
      status.className = 'status-line admin-wide admin-update-status';
      status.textContent = 'Đang tạo job refresh URL ảnh...';
    }

    try {
      const result = await fetchJson(`/api/admin/series/${encodeURIComponent(seriesId)}/refresh-image-urls`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({})
      });
      if (result.reused && status) status.textContent = 'Truyện này đang có job crawl, đang theo dõi job hiện tại...';
      const series = await pollImportJob(result.job.id, status, { navigateOnComplete: false });
      setAdminFlashMessage(refreshImageUrlsFlashMessage(series));
      invalidateContentCache();
      await renderAdminSeriesDetail(series.id || seriesId);
    } catch (error) {
      if (status) {
        status.className = 'status-line admin-wide admin-update-status error';
        status.textContent = error.message;
      }
      button.disabled = false;
      button.textContent = 'Refresh URL ảnh';
    }
  }

  return {
    handleRefreshImageUrls,
    handleUpdateChapters
  };
}
