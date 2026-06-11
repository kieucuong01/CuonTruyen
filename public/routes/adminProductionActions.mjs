import {
  parseProductionSteps
} from './adminJobHelpers.mjs';
import {
  renderAdminApiError as renderAdminApiErrorView,
  renderProductionCheckResult as renderProductionCheckResultView
} from './adminFeedbackView.mjs';

export function createAdminProductionActions({
  adminHeaders,
  app,
  cssEscape = (value) => CSS.escape(value),
  fetchJson,
  openWindow = (...args) => window.open(...args),
  pollProductionJob,
  renderProductionProgressStatus
} = {}) {
  function bindProductionPipelineActions({
    handleRefreshImageUrls,
    handleUpdateChapters
  } = {}) {
    if (handleUpdateChapters) {
      app.querySelectorAll('[data-update-chapters]').forEach((button) => button.addEventListener('click', handleUpdateChapters));
    }
    if (handleRefreshImageUrls) {
      app.querySelectorAll('[data-refresh-image-urls]').forEach((button) => button.addEventListener('click', handleRefreshImageUrls));
    }
    app.querySelectorAll('[data-publish-production]').forEach((button) => button.addEventListener('click', handleProductionPublish));
    app.querySelectorAll('[data-production-step]').forEach((button) => button.addEventListener('click', handleProductionStep));
    app.querySelectorAll('[data-production-check]').forEach((button) => button.addEventListener('click', handleProductionCheck));
  }

  async function handleProductionPublish(event) {
    await runProductionPipelineJob(event.currentTarget, {
      seriesId: event.currentTarget.dataset.publishProduction,
      steps: []
    });
  }

  async function handleProductionStep(event) {
    const button = event.currentTarget;
    await runProductionPipelineJob(button, {
      seriesId: button.dataset.productionStep,
      steps: parseProductionSteps(button.dataset.steps)
    });
  }

  async function runProductionPipelineJob(button, { seriesId, steps = [] } = {}) {
    const status = app.querySelector(`[data-production-publish-status="${cssEscape(seriesId)}"]`);
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = steps.length ? 'Dang chay buoc...' : 'Dang chay pipeline...';
    try {
      if (status) {
        status.className = 'status-line admin-wide production-publish-status';
        status.textContent = steps.length ? 'Dang tao job cho buoc da chon...' : 'Dang tao workflow production...';
      }
      const result = await fetchJson(`/api/admin/series/${encodeURIComponent(seriesId)}/publish-production`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ steps })
      });
      if (result.reused && status) {
        status.textContent = 'Dang dung lai job production dang chay cho buoc nay...';
      }
      const job = await pollProductionJob(result.job.id, status);
      if (status) renderProductionProgressStatus(status, job);
      if (job.status === 'completed') button.textContent = steps.length ? 'Chay lai buoc nay' : 'Sync lai production';
    } catch (error) {
      if (status) {
        status.className = 'status-line admin-wide production-publish-status error';
        status.innerHTML = renderAdminApiErrorView(error, 'Khong chay duoc production pipeline.');
      }
      button.textContent = originalText;
    } finally {
      button.disabled = false;
    }
  }

  async function handleProductionCheck(event) {
    const button = event.currentTarget;
    const seriesId = button.dataset.productionCheck;
    const url = button.dataset.productionUrl || '';
    const status = app.querySelector(`[data-production-publish-status="${cssEscape(seriesId)}"]`);
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Dang check...';
    try {
      if (!url) throw new Error('Truyen chua co production URL de kiem tra.');
      if (status) {
        status.className = 'status-line admin-wide production-publish-status';
        status.textContent = 'Dang kiem tra production URL...';
      }
      const result = await fetchJson('/api/admin/production-check', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ url, seriesId })
      });
      if (!result.ok) throw new Error(result.error || `Production tra ve HTTP ${result.status || '?'}.`);
      if (status) {
        status.className = 'status-line admin-wide production-publish-status success';
        status.innerHTML = renderProductionCheckResultView(result, url);
      }
      openWindow(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      if (status) {
        status.className = 'status-line admin-wide production-publish-status error';
        status.innerHTML = renderAdminApiErrorView(error, 'Check production loi.');
      }
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  return {
    bindProductionPipelineActions,
    handleProductionCheck,
    handleProductionPublish,
    handleProductionStep,
    runProductionPipelineJob
  };
}
