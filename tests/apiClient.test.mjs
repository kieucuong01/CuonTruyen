import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiClient, isCacheableRequest, publicSnapshotUrl } from '../public/apiClient.mjs';

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

test('tag query endpoints are cacheable public reads', () => {
  assert.equal(isCacheableRequest('/api/tags?tag=manhua'), true);
  assert.equal(isCacheableRequest('/api/tags/manhua'), true);
});

test('publicSnapshotUrl maps public reads to generated static snapshots', () => {
  const config = { publicSnapshotBaseUrl: '/static-api' };

  assert.equal(publicSnapshotUrl('/api/home', config), '/static-api/home.json');
  assert.equal(publicSnapshotUrl('/api/series', config), '/static-api/series.json');
  assert.equal(publicSnapshotUrl('/api/series?series=demo-series', config), '/static-api/series/demo-series.json');
  assert.equal(publicSnapshotUrl('/api/series/demo-series', config), '/static-api/series/demo-series.json');
  assert.equal(publicSnapshotUrl('/api/tags?tag=manhua', config), '/static-api/tags/manhua.json');
  assert.equal(
    publicSnapshotUrl('/api/reader?series=demo-series&chapter=chuong-1', config),
    '/static-api/reader/demo-series/chuong-1.json'
  );
  assert.equal(
    publicSnapshotUrl('/api/reader?series=demo-series&chapter=chuong-1&window=1', config),
    '/static-api/reader/demo-series/chuong-1/window-1.json'
  );
  assert.equal(
    publicSnapshotUrl('/api/series/demo-series/chapters/chuong-1?window=1', config),
    '/static-api/reader/demo-series/chuong-1/window-1.json'
  );
  assert.equal(publicSnapshotUrl('/api/series/demo-series/chapters/chuong-1/next?window=1', config), '');
  assert.equal(publicSnapshotUrl('/api/reader?series=demo-series&chapter=chuong-1&start=next', config), '');
  assert.equal(publicSnapshotUrl('/api/series?full=1', config), '');
});

test('public snapshot reads are preferred and fall back to live API when missing', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = globalThis.COMIC_READER_CONFIG;
  const requested = [];
  globalThis.COMIC_READER_CONFIG = {
    preferPublicSnapshots: true,
    publicSnapshotBaseUrl: '/static-api'
  };
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (String(url) === '/static-api/home.json') {
      return new Response(JSON.stringify({ hot: [{ id: 'from-static' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (String(url) === '/static-api/series/missing.json') {
      return new Response('Not found', { status: 404 });
    }
    return new Response(JSON.stringify({ id: 'from-live' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const client = createApiClient();
    const home = await client.fetchJson('/api/home');
    const series = await client.fetchJson('/api/series?series=missing');

    assert.equal(home.hot[0].id, 'from-static');
    assert.equal(series.id, 'from-live');
    assert.deepEqual(requested, [
      '/static-api/home.json',
      '/static-api/series/missing.json',
      '/api/series?series=missing'
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalConfig === undefined) delete globalThis.COMIC_READER_CONFIG;
    else globalThis.COMIC_READER_CONFIG = originalConfig;
  }
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
    const payload = await client.fetchJson('/api/reader?series=demo-series&chapter=chuong-1&window=1');
    assert.equal(payload.chapter.id, 'chuong-1');
    assert.deepEqual(requested, ['/api/reader?series=demo-series&chapter=chuong-1&window=1']);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalConfig === undefined) delete globalThis.COMIC_READER_CONFIG;
    else globalThis.COMIC_READER_CONFIG = originalConfig;
  }
});

test('reader payloads prefer static snapshots and fall back to live API when missing', async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = globalThis.COMIC_READER_CONFIG;
  const requested = [];
  globalThis.COMIC_READER_CONFIG = {
    preferPublicSnapshots: true,
    publicSnapshotBaseUrl: '/static-api'
  };
  globalThis.fetch = async (url) => {
    requested.push(String(url));
    if (String(url) === '/static-api/reader/demo-series/chuong-1/window-1.json') {
      return new Response(JSON.stringify({ chapter: { id: 'from-static' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (String(url) === '/static-api/reader/demo-series/missing.json') {
      return new Response('Not found', { status: 404 });
    }
    return new Response(JSON.stringify({ chapter: { id: 'from-live' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const client = createApiClient();
    const staticPayload = await client.fetchJson('/api/reader?series=demo-series&chapter=chuong-1&window=1');
    const livePayload = await client.fetchJson('/api/reader?series=demo-series&chapter=missing');

    assert.equal(staticPayload.chapter.id, 'from-static');
    assert.equal(livePayload.chapter.id, 'from-live');
    assert.deepEqual(requested, [
      '/static-api/reader/demo-series/chuong-1/window-1.json',
      '/static-api/reader/demo-series/missing.json',
      '/api/reader?series=demo-series&chapter=missing'
    ]);
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
    const payload = await client.fetchJson('/api/series?series=demo-series');
    assert.equal(payload.chapter.id, 'chuong-1');
    assert.deepEqual(requested, ['/api/series?series=demo-series']);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalConfig === undefined) delete globalThis.COMIC_READER_CONFIG;
    else globalThis.COMIC_READER_CONFIG = originalConfig;
  }
});
