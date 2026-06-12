import test from 'node:test';
import assert from 'node:assert/strict';

import {
  renderS3FailedItems,
  renderS3SyncStatusView
} from '../public/routes/adminS3SyncView.mjs';

test('S3 sync status view summarizes progress and failed retry controls', () => {
  const view = renderS3SyncStatusView({
    status: 'completed',
    message: 'Done <ok>',
    total: 10,
    checked: 5,
    uploaded: 3,
    skipped: 1,
    cachedSkipped: 1,
    failed: 1,
    seriesId: 'gacha',
    currentChapter: 'Chapter <1>',
    currentKey: 'imports/demo/001.webp',
    ratePerMinute: 12.34,
    eta: '0s',
    concurrency: 4,
    failedItems: [
      { key: 'imports/demo/<bad>.webp', error: 'Denied <403>' }
    ]
  }, { now: Date.parse('2026-06-12T10:00:00Z') });

  assert.equal(view.className, 'status-line s3-sync-status success');
  assert.match(view.html, /Done &lt;ok&gt;/);
  assert.match(view.html, /50% - 5\/10 file/);
  assert.match(view.html, /imports\/demo\/001\.webp/);
  assert.match(view.html, /imports\/demo\/&lt;bad&gt;\.webp/);
  assert.match(view.html, /Denied &lt;403&gt;/);
  assert.match(view.html, /data-s3-retry-failed/);
});

test('S3 sync status view warns when a running job is stale', () => {
  const view = renderS3SyncStatusView({
    status: 'running',
    total: 20,
    checked: 1,
    updatedAt: '2026-06-12T09:57:00Z'
  }, { now: Date.parse('2026-06-12T10:00:00Z') });

  assert.equal(view.className, 'status-line s3-sync-status warning');
  assert.match(view.html, /Status S3 sync/);
  assert.match(view.html, /90 giay/);
});

test('S3 failed item view includes clock skew guidance without leaking HTML', () => {
  const html = renderS3FailedItems([
    { key: '<script>bad</script>', error: 'RequestTimeTooSkewed <clock>' }
  ]);

  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(html, /RequestTimeTooSkewed &lt;clock&gt;/);
  assert.match(html, /đồng bộ giờ Windows/);
  assert.doesNotMatch(html, /<script>bad<\/script>/);
});
