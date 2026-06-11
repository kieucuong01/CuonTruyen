import {
  buildAdminChapterPatch,
  buildAdminSeriesPatch
} from './adminPayloads.mjs';

export function createAdminSaveActions({
  adminHeaders,
  canRunLocalOperations,
  fetchJson,
  formDataFactory = (form) => new FormData(form),
  invalidateContentCache,
  renderAdmin,
  setControlPending,
  splitList
} = {}) {
  async function handleAdminSave(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = formDataFactory(form);
    const seriesId = form.dataset.adminSeries;
    const patch = buildAdminSeriesPatch(formData, {
      splitList,
      localOps: canRunLocalOperations()
    });

    setControlPending(form.querySelector('button[type="submit"]'));
    await fetchJson(`/api/admin/series/${encodeURIComponent(seriesId)}`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify(patch)
    });

    for (const row of form.querySelectorAll('[data-admin-chapter]')) {
      const chapterId = row.dataset.adminChapter;
      await fetchJson(`/api/admin/series/${encodeURIComponent(seriesId)}/chapters/${encodeURIComponent(chapterId)}`, {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify(buildAdminChapterPatch(formData, chapterId))
      });
    }

    invalidateContentCache();
    await renderAdmin();
  }

  return {
    handleAdminSave
  };
}
