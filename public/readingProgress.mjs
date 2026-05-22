export function progressStorageKey(seriesId) {
  return `comic-reader-progress:${seriesId}`;
}

export function createProgressSnapshot({
  seriesId,
  chapterId,
  pageIndex = 0,
  scrollY = 0,
  progressPercent = 0
}) {
  return {
    seriesId,
    chapterId,
    pageIndex,
    scrollY,
    progressPercent: Math.max(0, Math.min(100, Math.round(progressPercent))),
    updatedAt: new Date().toISOString()
  };
}

export function saveProgress(snapshot) {
  localStorage.setItem(progressStorageKey(snapshot.seriesId), JSON.stringify(snapshot));
  localStorage.setItem('comic-reader-last-series', snapshot.seriesId);
}

export function loadProgress(seriesId) {
  try {
    const raw = localStorage.getItem(progressStorageKey(seriesId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function loadLastSeriesId() {
  return localStorage.getItem('comic-reader-last-series');
}
