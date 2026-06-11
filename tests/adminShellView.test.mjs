import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatAdminBulletinTime,
  renderAdminBulletinMessage,
  renderAdminBulletinPanel,
  renderAdminSessionBar,
  renderCatalogStorageNotice,
  renderCrawlQueuePanel,
  renderProductionAdminNotice,
  renderS3SyncPanel
} from '../public/routes/adminShellView.mjs';

test('admin session bar escapes the admin email and renders logout action', () => {
  const html = renderAdminSessionBar('owner<bad>@example.test');

  assert.match(html, /owner&lt;bad&gt;@example\.test/);
  assert.match(html, /data-admin-logout/);
  assert.doesNotMatch(html, /owner<bad>/);
});

test('admin bulletin panel renders pinned admin messages and escaped user messages', () => {
  const html = renderAdminBulletinPanel([
    {
      id: 'msg<1>',
      authorRole: 'admin',
      authorName: 'Admin <A>',
      text: 'Pinned <notice>',
      pinned: true,
      createdAt: '2026-06-12T09:59:00Z'
    },
    {
      id: 'msg-2',
      authorRole: 'reader',
      authorName: 'Reader <B>',
      text: 'Hello <script>',
      createdAt: '2026-06-11T09:00:00Z'
    }
  ], { now: Date.parse('2026-06-12T10:00:00Z') });

  assert.match(html, /Bảng tin Cuốn Truyện/);
  assert.match(html, /class="is-pinned"/);
  assert.match(html, /Admin &lt;A&gt;/);
  assert.match(html, /Pinned &lt;notice&gt;/);
  assert.match(html, /data-admin-bulletin-pin="msg&lt;1&gt;"/);
  assert.match(html, /Bỏ ghim/);
  assert.match(html, /Reader &lt;B&gt;/);
  assert.match(html, /User/);
  assert.doesNotMatch(html, /<script>/);
});

test('admin bulletin message and time helpers handle relative and fallback times', () => {
  const now = Date.parse('2026-06-12T10:00:00Z');

  assert.equal(formatAdminBulletinTime('', { now }), 'vừa xong');
  assert.equal(formatAdminBulletinTime('2026-06-12T09:59:30Z', { now }), 'vừa xong');
  assert.equal(formatAdminBulletinTime('2026-06-12T09:45:00Z', { now }), '15 phút trước');
  assert.equal(formatAdminBulletinTime('2026-06-12T08:00:00Z', { now }), '2 giờ trước');

  const html = renderAdminBulletinMessage({
    authorRole: 'admin',
    authorName: 'Admin',
    text: 'Notice',
    pinned: false,
    createdAt: '2026-06-12T09:45:00Z'
  }, { now });

  assert.match(html, /ADMIN/);
  assert.match(html, /15 phút trước/);
  assert.match(html, /data-pinned="false"/);
});

test('catalog storage notice summarizes source and production target safely', () => {
  const html = renderCatalogStorageNotice({
    storage: {
      mode: 'postgres',
      postgres: { host: 'local<db>', database: 'comic', source: 'CATALOG_DATABASE_URL' },
      productionPostgres: {
        configured: true,
        host: 'prod<db>',
        database: 'comic_prod',
        sameAsSource: false
      }
    },
    error: 'Storage <error>',
    cause: 'Cause <detail>',
    hints: ['Hint <one>', 'Hint two']
  });

  assert.match(html, /catalog-storage-notice error/);
  assert.match(html, /Postgres - local&lt;db&gt;\/comic \(CATALOG_DATABASE_URL\)/);
  assert.match(html, /configured - prod&lt;db&gt;\/comic_prod/);
  assert.match(html, /separate target DB/);
  assert.match(html, /Storage &lt;error&gt;/);
  assert.match(html, /Hint &lt;one&gt; \| Hint two/);
});

test('admin shell panels render expected local and production controls', () => {
  assert.match(renderProductionAdminNotice(), /Production admin/);
  assert.match(renderCrawlQueuePanel(), /data-crawl-queue-wake/);

  const s3Html = renderS3SyncPanel({
    storage: {
      mode: 'file',
      postgres: {},
      productionPostgres: { configured: false }
    }
  });

  assert.match(s3Html, /data-s3-sync-status/);
  assert.match(s3Html, /JSON local/);
  assert.match(s3Html, /missing PRODUCTION_CATALOG_DATABASE_URL/);
});
