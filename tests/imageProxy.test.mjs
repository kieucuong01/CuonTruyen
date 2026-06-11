import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
