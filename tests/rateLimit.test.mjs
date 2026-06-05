import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkApiRateLimit,
  createRateLimiter,
  isAdminStatusPath,
  isRateLimitedPath,
  rateLimitBucket
} from '../server/rateLimit.mjs';

test('createRateLimiter blocks requests over the configured window limit', () => {
  let now = 1_000;
  const limiter = createRateLimiter({ windowMs: 1_000, max: 2, now: () => now });

  assert.equal(limiter.check('client').allowed, true);
  assert.equal(limiter.check('client').allowed, true);
  const blocked = limiter.check('client');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);

  now = 2_001;
  assert.equal(limiter.check('client').allowed, true);
});

test('only admin/import/events routes are rate limited', () => {
  assert.equal(isRateLimitedPath('/api/admin/series'), true);
  assert.equal(isRateLimitedPath('/api/import'), true);
  assert.equal(isRateLimitedPath('/api/events'), true);
  assert.equal(isRateLimitedPath('/api/series'), false);
  assert.equal(rateLimitBucket('/api/events'), 'events');
  assert.equal(rateLimitBucket('/api/admin/series'), 'admin');
  assert.equal(rateLimitBucket('/api/admin/import-jobs/summary', 'GET'), 'admin-status');
  assert.equal(rateLimitBucket('/api/admin/import-jobs/summary', 'POST'), 'admin');
  assert.equal(isAdminStatusPath('/api/admin/s3-sync/status', 'GET'), true);
  assert.equal(isAdminStatusPath('/api/admin/s3-sync/status', 'POST'), false);
});

test('checkApiRateLimit uses forwarded client identity for protected routes', () => {
  const req = {
    method: 'GET',
    headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' }
  };

  assert.equal(checkApiRateLimit(req, '/api/series').allowed, true);
  assert.equal(checkApiRateLimit(req, '/api/admin/series').bucket, 'admin');
  assert.equal(checkApiRateLimit(req, '/api/admin/import-jobs/summary').bucket, 'admin-status');
});
