import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { adminJsonApi } from '../src/lib/server/admin-content-api.mjs';
import { nextLocalPipelineUnavailableApi } from '../src/lib/server/local-pipeline-api.mjs';

const routeFiles = [
  'src/app/api/admin/import-jobs/route.ts',
  'src/app/api/admin/import-jobs/summary/route.ts',
  'src/app/api/admin/import-jobs/wake/route.ts',
  'src/app/api/admin/import-jobs/[jobId]/route.ts',
  'src/app/api/admin/s3-sync/status/route.ts',
  'src/app/api/admin/s3-sync/retry-failed/route.ts',
  'src/app/api/admin/production-status/route.ts',
  'src/app/api/admin/production-check/route.ts',
  'src/app/api/admin/production-jobs/[jobId]/route.ts',
  'src/app/api/admin/series/[seriesId]/update-chapters/route.ts',
  'src/app/api/admin/series/[seriesId]/publish-production/route.ts',
  'src/app/api/import/route.ts',
  'src/app/api/import/[jobId]/route.ts'
];

test('next local pipeline unavailable helper requires admin token by default', async () => {
  const previous = {
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_TOKEN: process.env.ADMIN_TOKEN
  };
  process.env.ADMIN_EMAIL = 'admin@example.test';
  process.env.ADMIN_PASSWORD = 'pw';
  process.env.ADMIN_TOKEN = 'admin-token';

  try {
    const missing = await nextLocalPipelineUnavailableApi(
      new Request('https://example.test/api/admin/import-jobs'),
      'Crawl queue'
    );
    assert.equal(missing.status, 401);

    const allowed = adminJsonApi(await nextLocalPipelineUnavailableApi(
      new Request('https://example.test/api/admin/import-jobs', {
        headers: { 'x-admin-token': 'admin-token' }
      }),
      'Crawl queue'
    ));
    assert.equal(allowed.status, 503);
    assert.equal(allowed.headers.get('cache-control'), 'no-store');
    const body = await allowed.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /Crawl queue/);
    assert.match(body.hint, /admin local/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('next local pipeline routes exist as stubs and avoid heavy crawler imports', () => {
  for (const routeFile of routeFiles) {
    assert.equal(fs.existsSync(routeFile), true, `${routeFile} should exist`);
    const source = fs.readFileSync(routeFile, 'utf8');
    assert.match(source, /nextLocalPipelineUnavailableApi/);
    assert.doesNotMatch(source, /crawlWorker|importJobs|sync-vietnix|productionPublishJobs|child_process|spawn\(/);
  }

  const helperSource = fs.readFileSync('src/lib/server/local-pipeline-api.mjs', 'utf8');
  assert.doesNotMatch(helperSource, /crawlWorker|importJobs|sync-vietnix|productionPublishJobs|child_process|spawn\(/);
});
