import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiClient } from '../public/apiClient.mjs';

test('fetchJson turns plain text API 404 responses into clear errors', async () => {
  const client = createApiClient({
    resolveUrl: (url) => url,
    cache: {
      has: () => false,
      get: () => null,
      set: () => {},
      delete: () => {},
      clear: () => {}
    }
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('Not found', { status: 404 });

  try {
    await assert.rejects(
      () => client.fetchJson('/api/admin/login', { method: 'POST' }),
      /Kh\u00f4ng t\u00ecm th\u1ea5y API endpoint/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('userHeaders sends the current reader session token', () => {
  const client = createApiClient({
    userTokenProvider: () => 'reader-token'
  });

  assert.deepEqual(client.userHeaders(), {
    'content-type': 'application/json',
    'x-user-token': 'reader-token'
  });
});
