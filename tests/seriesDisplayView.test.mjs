import test from 'node:test';
import assert from 'node:assert/strict';

import {
  coverImageUrl,
  normalizeTagValue,
  renderCoverImageView,
  seriesOriginLabel
} from '../public/seriesDisplayView.mjs';

test('coverImageUrl prefers thumbnail variants before original cover fields', () => {
  assert.equal(coverImageUrl({
    thumbnailUrl: '/thumb.webp',
    coverThumbnailUrl: '/cover-thumb.webp',
    coverUrl: '/cover.jpg',
    imageUrl: '/image.jpg'
  }), '/thumb.webp');
  assert.equal(coverImageUrl({
    coverThumbnailUrl: '/cover-thumb.webp',
    coverUrl: '/cover.jpg',
    imageUrl: '/image.jpg'
  }), '/cover-thumb.webp');
  assert.equal(coverImageUrl({ coverUrl: '/cover.jpg', imageUrl: '/image.jpg' }), '/cover.jpg');
  assert.equal(coverImageUrl({ imageUrl: '/image.jpg' }), '/image.jpg');
  assert.equal(coverImageUrl({}), '');
});

test('renderCoverImageView escapes cover URL, title, attributes, and fallback text', () => {
  const imageHtml = renderCoverImageView(
    { thumbnailUrl: '/cover.webp?x=<1>', title: 'A <B>' },
    'No <cover>',
    'loading="eager" data-test="<bad>"'
  );
  const fallbackHtml = renderCoverImageView({}, 'No <cover>');

  assert.match(imageHtml, /src="\/cover\.webp\?x=&lt;1&gt;"/);
  assert.match(imageHtml, /alt="A &lt;B&gt;"/);
  assert.match(imageHtml, /loading="eager" data-test="&lt;bad&gt;"/);
  assert.equal(fallbackHtml, '<span>No &lt;cover&gt;</span>');
});

test('normalizeTagValue makes Vietnamese and punctuation tags comparable', () => {
  assert.equal(normalizeTagValue('Truyện Hàn Quốc'), 'truyen-han-quoc');
  assert.equal(normalizeTagValue('Đô thị / Action'), 'do-thi-action');
});

test('seriesOriginLabel resolves origin from tag names, slugs, and adapter fallback', () => {
  assert.equal(seriesOriginLabel({ tags: ['Manhwa'] }), 'Truyện Hàn');
  assert.equal(seriesOriginLabel({ tags: [{ slug: 'truyen-nhat', name: 'Manga' }] }), 'Truyện Nhật');
  assert.equal(seriesOriginLabel({ tags: [{ slug: 'manhua', name: 'Truyện Trung' }] }), 'Truyện Trung');
  assert.equal(seriesOriginLabel({ sourceMappings: [{ adapter: 'truyenqq' }] }), 'truyenqq');
  assert.equal(seriesOriginLabel({}), 'Truyện tranh');
});
