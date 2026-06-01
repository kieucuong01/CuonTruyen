import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adminConfigStatus,
  createAdminSession,
  extractAdminToken,
  isAdminAuthorized,
  isAdminPath
} from '../server/adminAuth.mjs';

test('extractAdminToken accepts explicit and bearer tokens', () => {
  assert.equal(extractAdminToken({ 'x-admin-token': 'secret' }), 'secret');
  assert.equal(extractAdminToken({ authorization: 'Bearer secret-2' }), 'secret-2');
});

test('adminConfigStatus requires all admin environment values', () => {
  assert.deepEqual(adminConfigStatus({ email: '', password: 'pw', token: 'session-token' }).missing, ['ADMIN_EMAIL']);
  assert.equal(adminConfigStatus({ email: 'admin@example.com', password: 'pw', token: 'session-token' }).configured, true);
});

test('isAdminAuthorized rejects requests when no token is configured', () => {
  assert.equal(isAdminAuthorized({ 'x-admin-token': 'secret' }, ''), false);
  assert.equal(isAdminAuthorized({ 'x-admin-token': 'wrong' }, 'secret'), false);
  assert.equal(isAdminAuthorized({ 'x-admin-token': 'secret' }, 'secret'), true);
});

test('createAdminSession returns an API token only for configured valid credentials', () => {
  assert.equal(createAdminSession(
    { email: 'admin@example.com', password: 'pw' },
    { email: '', password: 'pw', token: 'session-token' }
  ), null);
  assert.deepEqual(
    createAdminSession(
      { email: 'admin@example.com', password: 'pw' },
      { email: 'admin@example.com', password: 'pw', token: 'session-token' }
    ),
    { email: 'admin@example.com', token: 'session-token' }
  );
  assert.equal(createAdminSession(
    { email: 'admin@example.com', password: 'wrong' },
    { email: 'admin@example.com', password: 'pw', token: 'session-token' }
  ), null);
});

test('isAdminPath protects crawl and admin endpoints', () => {
  assert.equal(isAdminPath('/api/admin/import-jobs'), true);
  assert.equal(isAdminPath('/api/import'), true);
  assert.equal(isAdminPath('/api/series'), false);
});
