import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isRetryableS3Failure,
  shouldRefuseFullImageSync,
  s3SyncScopeMessage
} from '../scripts/sync-vietnix-s3.mjs';

test('S3 image sync refuses full-bucket image runs by default', () => {
  assert.equal(shouldRefuseFullImageSync({
    includesImages: true,
    seriesId: '',
    allowFull: false,
    retryFailed: false
  }), true);

  assert.equal(shouldRefuseFullImageSync({
    includesImages: true,
    seriesId: 'hoa-son-tai-khoi',
    allowFull: false,
    retryFailed: false
  }), false);

  assert.equal(shouldRefuseFullImageSync({
    includesImages: false,
    seriesId: '',
    allowFull: false,
    retryFailed: false
  }), false);
});

test('S3 retry-failed mode is allowed without a series id', () => {
  assert.equal(shouldRefuseFullImageSync({
    includesImages: true,
    seriesId: '',
    allowFull: false,
    retryFailed: true
  }), false);
});

test('S3 sync treats RequestTimeTooSkewed as retryable and actionable', () => {
  const text = '<Error><Code>RequestTimeTooSkewed</Code><Message>The difference between the request time and current time is too large.</Message></Error>';
  assert.equal(isRetryableS3Failure({ status: 403, text }), true);
  assert.match(s3SyncScopeMessage({ retryFailed: true, failedCount: 2 }), /Retry 2 file/);
});
