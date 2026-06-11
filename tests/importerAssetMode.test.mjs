import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExternalImageUrlPage,
  resolveAssetMode
} from '../server/importer.mjs';

test('resolveAssetMode defaults new imports to image URLs only', () => {
  assert.equal(resolveAssetMode(), 'image_url');
  assert.equal(resolveAssetMode('full_download'), 'full_download');
  assert.equal(resolveAssetMode('unknown'), 'image_url');
});

test('buildExternalImageUrlPage keeps source image URLs without local storage', () => {
  const page = buildExternalImageUrlPage('https://cdn.example.test/chapter/001.jpg', 0);

  assert.deepEqual(page, {
    index: 0,
    sourceUrl: 'https://cdn.example.test/chapter/001.jpg',
    src: 'https://cdn.example.test/chapter/001.jpg',
    imageUrl: 'https://cdn.example.test/chapter/001.jpg',
    storageKey: '',
    width: null,
    height: null,
    assetStatus: 'external'
  });
});
