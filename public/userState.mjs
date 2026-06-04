export const USER_SESSION_KEY = 'comic-user-session';

const memoryStorage = new Map();

function getBrowserStorage() {
  try {
    if (globalThis.localStorage?.getItem && globalThis.localStorage?.setItem) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function getStorage(storage) {
  if (storage) return storage;
  return getBrowserStorage() || {
    getItem(key) {
      return memoryStorage.has(key) ? memoryStorage.get(key) : null;
    },
    setItem(key, value) {
      memoryStorage.set(key, String(value));
    },
    removeItem(key) {
      memoryStorage.delete(key);
    }
  };
}

function readJson(key, fallback, storage) {
  try {
    const raw = getStorage(storage).getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value, storage) {
  getStorage(storage).setItem(key, JSON.stringify(value));
}

export function normalizeUserIdentifier(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

export function followStorageKey(userId) {
  return `comic-user-follows:${userId}`;
}

export function loadUserSession({ storage } = {}) {
  const session = readJson(USER_SESSION_KEY, null, storage);
  return session?.id && session?.token ? session : null;
}

export function saveUserSession(session, { storage } = {}) {
  if (!session?.id || !session?.token) throw new Error('Phiên đăng nhập không hợp lệ.');
  writeJson(USER_SESSION_KEY, session, storage);
  return session;
}

export function clearUserSession({ storage } = {}) {
  getStorage(storage).removeItem(USER_SESSION_KEY);
}

export function loadFollowedSeriesIds({ storage, user = loadUserSession({ storage }) } = {}) {
  if (!user?.id) return [];
  const ids = readJson(followStorageKey(user.id), [], storage);
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter(Boolean))];
}

export function isFollowingSeries(seriesId, options = {}) {
  return loadFollowedSeriesIds(options).includes(seriesId);
}

export function toggleFollowSeries(seriesId, { storage, user = loadUserSession({ storage }) } = {}) {
  if (!user?.id) throw new Error('Bạn cần đăng nhập để theo dõi truyện.');
  const current = loadFollowedSeriesIds({ storage, user });
  const following = !current.includes(seriesId);
  const seriesIds = following
    ? [seriesId, ...current].filter(Boolean)
    : current.filter((id) => id !== seriesId);
  writeJson(followStorageKey(user.id), seriesIds, storage);
  return { following, seriesIds };
}
