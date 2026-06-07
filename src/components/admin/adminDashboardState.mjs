export function adminDashboardSeriesStats(series = {}) {
  const chapters = Array.isArray(series.chapters) ? series.chapters : [];
  const publicChapters = chapters.filter((chapter) => chapter?.status === 'public').length;
  const hiddenChapters = chapters.filter((chapter) => chapter?.status !== 'public').length;

  return {
    totalChapters: chapters.length,
    publicChapters,
    hiddenChapters,
    status: series.status || 'draft'
  };
}

export function adminDashboardTotals(seriesList = []) {
  const series = Array.isArray(seriesList) ? seriesList : [];
  return series.reduce((totals, item) => {
    const stats = adminDashboardSeriesStats(item);
    totals.series += 1;
    totals.publicSeries += stats.status === 'public' ? 1 : 0;
    totals.totalChapters += stats.totalChapters;
    totals.publicChapters += stats.publicChapters;
    totals.hiddenChapters += stats.hiddenChapters;
    return totals;
  }, {
    series: 0,
    publicSeries: 0,
    totalChapters: 0,
    publicChapters: 0,
    hiddenChapters: 0
  });
}

export function adminSeriesAdminHref(series = {}) {
  const id = String(series.id || series.slug || '').trim();
  return id ? `/admin/series/${encodeURIComponent(id)}` : '/admin';
}
