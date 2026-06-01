export function progressStorageKey(seriesId) {
  return `comic-reader-progress:${seriesId}`;
}

const memoryStorage = new Map();

function getStorage() {
  try {
    if (globalThis.localStorage?.getItem && globalThis.localStorage?.setItem) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function readStorageItem(key) {
  const storage = getStorage();
  if (storage) {
    try {
      return storage.getItem(key);
    } catch {
      return memoryStorage.get(key) || null;
    }
  }
  return memoryStorage.get(key) || null;
}

function writeStorageItem(key, value) {
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(key, value);
      return;
    } catch {
      // Fall back to in-memory progress so the current SPA session still supports "Đọc tiếp".
    }
  }
  memoryStorage.set(key, value);
}

export function createProgressSnapshot({
  seriesId,
  chapterId,
  pageIndex = 0,
  scrollY = 0,
  chapterScrollY = 0,
  progressPercent = 0
}) {
  return {
    seriesId,
    chapterId,
    pageIndex,
    scrollY,
    chapterScrollY,
    progressPercent: Math.max(0, Math.min(100, Math.round(progressPercent))),
    updatedAt: new Date().toISOString()
  };
}

export function createResumeLoadPlan(chapters = [], saved = null, minimumLoaded = 2) {
  const fallbackChapterId = chapters[0]?.id || '';
  const savedChapterId = saved?.chapterId || fallbackChapterId;
  const savedIndex = chapters.findIndex((chapter) => chapter.id === savedChapterId);
  const targetIndex = savedIndex >= 0 ? savedIndex : 0;
  return {
    currentChapterId: chapters[targetIndex]?.id || fallbackChapterId,
    loadedChapterCount: Math.min(chapters.length || 1, Math.max(minimumLoaded, targetIndex + 1))
  };
}

export function canSaveReaderProgress({
  isRestoring = false,
  hasSeries = false,
  hasChapter = false,
  hasReader = false
} = {}) {
  return !isRestoring && hasSeries && hasChapter && hasReader;
}

export function updateReadingHistory(history = [], seriesId, limit = 8) {
  const next = [
    seriesId,
    ...history.filter((id) => id && id !== seriesId)
  ].filter(Boolean);
  return next.slice(0, limit);
}

export function findCurrentChapterFromLayout(chapters = [], viewportY = 0, fallbackId = '') {
  if (!chapters.length) return fallbackId;
  const active = chapters.find((chapter) => viewportY >= chapter.top && viewportY < chapter.bottom);
  if (active) return active.id;
  const previous = [...chapters].reverse().find((chapter) => viewportY >= chapter.top);
  return previous?.id || chapters[0]?.id || fallbackId;
}

export function saveProgress(snapshot) {
  writeStorageItem(progressStorageKey(snapshot.seriesId), JSON.stringify(snapshot));
  writeStorageItem('comic-reader-last-series', snapshot.seriesId);
  writeStorageItem(
    'comic-reader-history',
    JSON.stringify(updateReadingHistory(loadReadingHistory(), snapshot.seriesId))
  );
}

export function loadProgress(seriesId) {
  try {
    const raw = readStorageItem(progressStorageKey(seriesId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function loadLastSeriesId() {
  return readStorageItem('comic-reader-last-series');
}

export function loadReadingHistory() {
  try {
    const raw = readStorageItem('comic-reader-history');
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean);
  } catch {
    return [];
  }
}
