import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearUserSession,
  isFollowingSeries,
  loadFollowedSeriesIds,
  loadUserSession,
  saveUserSession,
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

function userFixture() {
  return {
    id: 'user_123',
    identifier: 'cuong@example.com',
    displayName: 'Cuong',
    token: 'session-token'
  };
}

test('saveUserSession stores a server-issued session token', () => {
  const storage = createStorage();
  const session = saveUserSession(userFixture(), { storage });

  assert.equal(session.id, 'user_123');
  assert.equal(loadUserSession({ storage }).token, 'session-token');
});

test('saveUserSession rejects sessions without a token', () => {
  assert.throws(() => saveUserSession({ id: 'user_123' }), /Phiên đăng nhập không hợp lệ/);
});

test('toggleFollowSeries keeps followed series per active user without duplicates', () => {
  const storage = createStorage();
  const user = saveUserSession(userFixture(), { storage });

  assert.deepEqual(loadFollowedSeriesIds({ storage, user }), []);
  assert.deepEqual(toggleFollowSeries('series-1', { storage, user }).seriesIds, ['series-1']);
  assert.equal(isFollowingSeries('series-1', { storage, user }), true);
  assert.deepEqual(toggleFollowSeries('series-1', { storage, user }).seriesIds, []);
  assert.equal(isFollowingSeries('series-1', { storage, user }), false);
});

test('clearUserSession logs out without deleting followed series', () => {
  const storage = createStorage();
  const user = saveUserSession(userFixture(), { storage });
  toggleFollowSeries('series-1', { storage, user });

  clearUserSession({ storage });

  assert.equal(loadUserSession({ storage }), null);
  assert.deepEqual(loadFollowedSeriesIds({ storage, user }), ['series-1']);
});
