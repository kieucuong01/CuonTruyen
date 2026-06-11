import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearAdminSession,
  loadAdminEmail,
  loadAdminToken,
  saveAdminSession
} from '../public/routes/adminSession.mjs';

function withLocalStorage(storage, callback) {
  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = storage;
  try {
    callback();
  } finally {
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }
}

function createStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    values,
    getItem(key) {
      return values.get(key) || null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

test('admin session saves and loads token and email from localStorage', () => {
  const storage = createStorage();
  withLocalStorage(storage, () => {
    clearAdminSession();
    saveAdminSession({ token: ' token-123 ', email: ' admin@example.test ' });

    assert.equal(storage.values.get('comic-admin-token'), 'token-123');
    assert.equal(storage.values.get('comic-admin-email'), 'admin@example.test');
    assert.equal(loadAdminToken(), 'token-123');
    assert.equal(loadAdminEmail(), 'admin@example.test');
  });
});

test('admin session falls back to in-memory values when localStorage throws', () => {
  const throwingStorage = {
    getItem() {
      throw new Error('storage unavailable');
    },
    setItem() {
      throw new Error('storage unavailable');
    },
    removeItem() {
      throw new Error('storage unavailable');
    }
  };

  withLocalStorage(throwingStorage, () => {
    clearAdminSession();
    saveAdminSession({ token: 'memory-token', email: 'memory@example.test' });

    assert.equal(loadAdminToken(), 'memory-token');
    assert.equal(loadAdminEmail(), 'memory@example.test');
  });
});

test('clearAdminSession clears storage-backed and in-memory admin credentials', () => {
  const storage = createStorage({
    'comic-admin-token': 'stored-token',
    'comic-admin-email': 'stored@example.test'
  });

  withLocalStorage(storage, () => {
    saveAdminSession({ token: 'memory-token', email: 'memory@example.test' });
    clearAdminSession();

    assert.equal(loadAdminToken(), '');
    assert.equal(loadAdminEmail(), '');
    assert.equal(storage.values.has('comic-admin-token'), false);
    assert.equal(storage.values.has('comic-admin-email'), false);
  });
});
