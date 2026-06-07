import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  adminDashboardSeriesStats,
  adminSeriesAdminHref
} from '../src/components/admin/adminDashboardState.mjs';

test('next admin dashboard route no longer loads the legacy SPA bundle', () => {
  const pageSource = fs.readFileSync('src/app/admin/page.tsx', 'utf8');
  const dashboardSource = fs.readFileSync('src/components/admin/AdminDashboardIsland.tsx', 'utf8');

  assert.match(pageSource, /AdminDashboardIsland/);
  assert.doesNotMatch(pageSource, /LegacyAdminShell/);
  assert.doesNotMatch(dashboardSource, /\/app\.js|\/config\.js|LegacyAdminShell/);
});

test('next admin dashboard stays content-only and keeps crawler pipeline out of Vercel UI', () => {
  const dashboardSource = fs.readFileSync('src/components/admin/AdminDashboardIsland.tsx', 'utf8');

  assert.match(dashboardSource, /\/api\/admin\/catalog/);
  assert.match(dashboardSource, /\/api\/admin\/analytics\/summary/);
  assert.match(dashboardSource, /\/api\/admin\/bulletin\/messages/);
  assert.doesNotMatch(dashboardSource, /import-jobs|s3-sync|publish-production|update-chapters/);
});

test('next admin dashboard helpers summarize content without page arrays', () => {
  const summary = adminDashboardSeriesStats({
    id: 'series-1',
    slug: 'demo',
    status: 'public',
    chapters: [
      { status: 'public' },
      { status: 'draft' },
      { status: 'removed' }
    ]
  });

  assert.deepEqual(summary, {
    totalChapters: 3,
    publicChapters: 1,
    hiddenChapters: 2,
    status: 'public'
  });
  assert.equal(adminSeriesAdminHref({ id: 'series 1', slug: 'demo' }), '/admin/series/series%201');
  assert.equal(adminSeriesAdminHref({ slug: 'demo' }), '/admin/series/demo');
}
);
