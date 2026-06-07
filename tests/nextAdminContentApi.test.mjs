import assert from 'node:assert/strict';
import test from 'node:test';

import { adminJsonApi, nextAdminContentAction } from '../src/lib/server/admin-content-api.mjs';

test('nextAdminContentAction rejects admin content requests without configured env', async () => {
  const previous = {
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_TOKEN: process.env.ADMIN_TOKEN
  };
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_TOKEN;

  try {
    const result = await nextAdminContentAction(new Request('https://example.test/api/admin/catalog'), async () => ({
      body: { ok: true }
    }));

    assert.equal(result.status, 503);
    assert.match(result.body.error, /Admin environment is not configured/);
  } finally {
    restoreEnv(previous);
  }
});

test('nextAdminContentAction requires a valid admin token before invoking action', async () => {
  const previous = {
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    ADMIN_TOKEN: process.env.ADMIN_TOKEN
  };
  process.env.ADMIN_EMAIL = 'admin@example.test';
  process.env.ADMIN_PASSWORD = 'secret-password';
  process.env.ADMIN_TOKEN = 'admin-token';
  let invoked = false;

  try {
    const missing = await nextAdminContentAction(new Request('https://example.test/api/admin/catalog'), async () => {
      invoked = true;
      return { body: { ok: true } };
    });
    const valid = await nextAdminContentAction(new Request('https://example.test/api/admin/catalog', {
      headers: { 'x-admin-token': 'admin-token' }
    }), async () => {
      invoked = true;
      return { status: 201, body: { ok: true } };
    });

    assert.equal(missing.status, 401);
    assert.equal(valid.status, 201);
    assert.deepEqual(valid.body, { ok: true });
    assert.equal(invoked, true);
  } finally {
    restoreEnv(previous);
  }
});

test('adminJsonApi converts admin content results into no-store JSON responses', async () => {
  const response = adminJsonApi({ status: 202, body: { ok: true } });

  assert.equal(response.status, 202);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { ok: true });
});

function restoreEnv(values) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
