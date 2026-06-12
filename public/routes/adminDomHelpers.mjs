export function bindAdminImageFallbacks(app) {
  app.querySelectorAll('[data-admin-cover-img]').forEach((image) => {
    image.addEventListener('error', handleAdminCoverError, { once: false });
  });
}

export function handleAdminCoverError(event) {
  const image = event.currentTarget;
  const fallbackSrc = image.dataset.fallbackSrc || '';
  if (fallbackSrc && image.getAttribute('src') !== fallbackSrc) {
    image.removeAttribute('data-fallback-src');
    image.src = fallbackSrc;
    return;
  }
  image.closest('.admin-series-cover')?.classList.add('is-missing');
  image.remove();
}

export function findAdminSeries(catalog, seriesId) {
  const id = String(seriesId || '');
  return (catalog.series || []).find((series) => series.id === id || series.slug === id) || null;
}

export function isAdminAuthError(error) {
  return /admin token is required|unauthorized|401/i.test(error?.message || '');
}
