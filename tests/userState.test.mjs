import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearUserSession,
  isFollowingSeries,
  loadFollowedSeriesIds,
  loadUserSession,
  loginOrRegisterUser,
  toggleFollowSeries
} from '../public/userState.mjs';

function createStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    }
  };
}

test('loginOrRegisterUser creates a lightweight session from one input', () => {
  const storage = createStorage();
  const session = loginOrRegisterUser('  cuong@example.com  ', {
    storage,
    now: () => new Date('2026-05-23T10:00:00.000Z')
  });

  assert.equal(session.id, 'user:cuong-example-com');
  assert.equal(session.displayName, 'Cuong');
  assert.equal(session.identifier, 'cuong@example.com');
  assert.equal(loadUserSession({ storage }).id, session.id);
});

test('loginOrRegisterUser reuses the same local profile on later login', () => {
  const storage = createStorage();
  const first = loginOrRegisterUser('Lan', {
    storage,
    now: () => new Date('2026-05-23T10:00:00.000Z')
  });
  const second = loginOrRegisterUser(' lan ', {
    storage,
    now: () => new Date('2026-05-24T10:00:00.000Z')
  });

  assert.equal(second.id, first.id);
  assert.equal(second.createdAt, first.createdAt);
  assert.equal(second.lastLoginAt, '2026-05-24T10:00:00.000Z');
});

test('toggleFollowSeries keeps followed series per active user without duplicates', () => {
  const storage = createStorage();
  const user = loginOrRegisterUser('Reader', { storage });

  assert.deepEqual(loadFollowedSeriesIds({ storage, user }), []);
  assert.deepEqual(toggleFollowSeries('series-1', { storage, user }).seriesIds, ['series-1']);
  assert.equal(isFollowingSeries('series-1', { storage, user }), true);
  assert.deepEqual(toggleFollowSeries('series-1', { storage, user }).seriesIds, []);
  assert.equal(isFollowingSeries('series-1', { storage, user }), false);
});

test('clearUserSession logs out without deleting followed series', () => {
  const storage = createStorage();
  const user = loginOrRegisterUser('Reader', { storage });
  toggleFollowSeries('series-1', { storage, user });

  clearUserSession({ storage });

  assert.equal(loadUserSession({ storage }), null);
  assert.deepEqual(loadFollowedSeriesIds({ storage, user }), ['series-1']);
});
