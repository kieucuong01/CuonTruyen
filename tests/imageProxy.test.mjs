import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleImageProxyRequest,
  proxiedExternalImageUrl,
  shouldProxyExternalImageUrl
} from '../server/imageProxy.mjs';

const SOURCE_IMAGE = 'https://s135.hinhhinh.com/12503/0/0.jpg?gt=hdfgdfg';

test('proxies hotlink-protected hinhhinh image URLs', () => {
  assert.equal(shouldProxyExternalImageUrl(SOURCE_IMAGE), true);

  const proxiedUrl = proxiedExternalImageUrl(SOURCE_IMAGE);
  assert.equal(proxiedUrl.startsWith('/api/image-proxy?url='), true);
  assert.equal(new URLSearchParams(proxiedUrl.split('?')[1]).get('url'), SOURCE_IMAGE);
});

test('does not proxy local imports or unrelated image hosts', () => {
  assert.equal(proxiedExternalImageUrl('/imports/demo/chapter-1/001.webp'), '/imports/demo/chapter-1/001.webp');
  assert.equal(
    proxiedExternalImageUrl('https://img.cuontruyen.com/imports/demo/chapter-1/001.webp'),
    'https://img.cuontruyen.com/imports/demo/chapter-1/001.webp'
  );
  assert.equal(
    proxiedExternalImageUrl('https://example.com/001.jpg'),
    'https://example.com/001.jpg'
  );
});

test('respects configured allowed host suffixes', () => {
  assert.equal(shouldProxyExternalImageUrl('https://cdn.example.net/a/001.webp', {
    IMAGE_PROXY_ALLOWED_HOSTS: 'cdn.example.net'
  }), true);
  assert.equal(shouldProxyExternalImageUrl('https://other.example.net/a/001.webp', {
    IMAGE_PROXY_ALLOWED_HOSTS: 'cdn.example.net'
  }), false);
});

test('handles HEAD image proxy checks without returning a response body', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'content-type': 'image/jpeg', 'content-length': '3' }
  });
  const res = createMockResponse();
  try {
    const handled = await handleImageProxyRequest(
      { method: 'HEAD' },
      res,
      new URL(`https://cuontruyen.test/api/image-proxy?url=${encodeURIComponent(SOURCE_IMAGE)}`)
    );

    assert.equal(handled, true);
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'image/jpeg');
    assert.equal(res.body.byteLength, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function createMockResponse() {
  return {
    status: null,
    headers: {},
    body: Buffer.alloc(0),
    writeHead(status, headers = {}) {
      this.status = status;
      this.headers = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
    },
    end(body = Buffer.alloc(0)) {
      this.body = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''));
    }
  };
}
