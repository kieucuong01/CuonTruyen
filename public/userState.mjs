export const USER_SESSION_KEY = 'comic-user-session';
export const USER_PROFILES_KEY = 'comic-user-profiles';

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

function slugUserId(identifier) {
  const safe = normalizeUserIdentifier(identifier)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `user:${safe || 'reader'}`;
}

function displayNameFromIdentifier(identifier) {
  const normalized = normalizeUserIdentifier(identifier);
  const name = normalized.includes('@') ? normalized.split('@')[0] : normalized;
  return name
    .split(/[.\-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Reader';
}

export function followStorageKey(userId) {
  return `comic-user-follows:${userId}`;
}

export function loadUserSession({ storage } = {}) {
  const session = readJson(USER_SESSION_KEY, null, storage);
  return session?.id ? session : null;
}

export function loginOrRegisterUser(identifier, { storage, now = () => new Date() } = {}) {
  const normalized = normalizeUserIdentifier(identifier);
  if (!normalized) throw new Error('Vui lòng nhập tên hoặc email.');

  const profiles = readJson(USER_PROFILES_KEY, {}, storage);
  const id = slugUserId(normalized);
  const timestamp = now().toISOString();
  const existing = profiles[id] || {};
  const session = {
    id,
    identifier: normalized,
    displayName: existing.displayName || displayNameFromIdentifier(normalized),
    createdAt: existing.createdAt || timestamp,
    lastLoginAt: timestamp
  };

  profiles[id] = session;
  writeJson(USER_PROFILES_KEY, profiles, storage);
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
