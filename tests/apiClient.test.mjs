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

test('static API mode serves reader chapter payloads from static reader JSON', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = globalThis.COMIC_READER_CONFIG;
  const requested = [];
  globalThis.COMIC_READER_CONFIG = {
    staticApiMode: true,
    staticApiBaseUrl: '/static-api'
  };
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
    assert.deepEqual(requested, ['/static-api/reader/demo-series/chuong-1.json']);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalConfig === undefined) delete globalThis.COMIC_READER_CONFIG;
    else globalThis.COMIC_READER_CONFIG = originalConfig;
  }
});

test('static API mode prefers packaged Vercel reader JSON before remote S3', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = globalThis.COMIC_READER_CONFIG;
  const requested = [];
  globalThis.COMIC_READER_CONFIG = {
    staticApiMode: true,
    staticApiBaseUrl: 'https://s3.example.test/static-api'
  };
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
    assert.deepEqual(requested, ['/static-api/reader/demo-series/chuong-1.json']);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalConfig === undefined) delete globalThis.COMIC_READER_CONFIG;
    else globalThis.COMIC_READER_CONFIG = originalConfig;
  }
});
