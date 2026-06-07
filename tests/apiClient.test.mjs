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

test('reader payloads use the live API', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = globalThis.COMIC_READER_CONFIG;
  const requested = [];
  globalThis.COMIC_READER_CONFIG = {};
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    return new Response(JSON.stringify({ chapter: { id: 'chuong-1' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const client = createApiClient();
    const payload = await client.fetchJson('/api/series/demo-series/chapters/chuong-1?window=1');
    assert.equal(payload.chapter.id, 'chuong-1');
    assert.deepEqual(requested, ['/api/series/demo-series/chapters/chuong-1?window=1']);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalConfig === undefined) delete globalThis.COMIC_READER_CONFIG;
    else globalThis.COMIC_READER_CONFIG = originalConfig;
  }
});

test('series payloads use the live API', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = globalThis.COMIC_READER_CONFIG;
  const requested = [];
  globalThis.COMIC_READER_CONFIG = {};
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    return new Response(JSON.stringify({ chapter: { id: 'chuong-1' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const client = createApiClient();
    const payload = await client.fetchJson('/api/series/demo-series');
    assert.equal(payload.chapter.id, 'chuong-1');
    assert.deepEqual(requested, ['/api/series/demo-series']);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalConfig === undefined) delete globalThis.COMIC_READER_CONFIG;
    else globalThis.COMIC_READER_CONFIG = originalConfig;
  }
});
