import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adminSeriesStats,
  assetStatusClass,
  assetStatusLabel,
  normalizeStatusClass,
  renderAdminSeriesBadges,
  renderAssetModeBadge,
  seriesUsesExternalImageUrls,
  sourceUrlForAdminSeries,
  statusLabel
} from '../public/routes/adminSeriesView.mjs';

test('admin series stats counts moderation and missing image state', () => {
  const stats = adminSeriesStats({
    status: 'public',
    pageCount: 10,
    chapters: [
      { id: 'ready', status: 'public', pages: [{ imageUrl: '/imports/a.webp' }] },
      { id: 'draft', status: 'draft', imported: true, pageCount: 1 },
      { id: 'removed', status: 'removed' },
      { id: 'missing', status: 'public', pageCount: 0 }
    ]
  });

  assert.deepEqual(stats, {
    status: 'public',
    chapterCount: 4,
    importedChapterCount: 4,
    pageCount: 10,
    draftCount: 1,
    removedCount: 1,
    missingImageCount: 2
  });
});

test('admin series badges escape text and expose stable status labels', () => {
  assert.equal(statusLabel('public'), 'Public');
  assert.equal(statusLabel('removed'), 'Removed');
  assert.equal(statusLabel('other'), 'Draft');
  assert.equal(normalizeStatusClass('public'), 'public');
  assert.equal(normalizeStatusClass('unexpected'), 'draft');

  const html = renderAdminSeriesBadges({
    status: '"><script>',
    draftCount: 2,
    removedCount: 1,
    missingImageCount: 3
  });

  assert.match(html, /admin-series-status is-draft/);
  assert.match(html, /Draft/);
  assert.match(html, /2 draft/);
  assert.match(html, /1 đã ẩn/);
  assert.match(html, /3 thiếu ảnh/);
  assert.doesNotMatch(html, /<script>/);
});

test('asset mode helpers describe local, external, mixed, s3, and cdn assets', () => {
  assert.equal(assetStatusLabel('local'), 'Đã có file local/S3');
  assert.equal(assetStatusLabel('s3'), 'Đã sync S3');
  assert.equal(assetStatusLabel('cdn'), 'Đã qua CDN');
  assert.equal(assetStatusLabel('mixed'), 'Lẫn URL và file');
  assert.equal(assetStatusLabel('external'), 'Đọc ảnh từ nguồn');
  assert.equal(assetStatusClass('local'), 'public');
  assert.equal(assetStatusClass('mixed'), 'draft');
  assert.equal(assetStatusClass('external'), 'removed');

  assert.equal(seriesUsesExternalImageUrls({ importMode: 'image_url' }), true);
  assert.equal(seriesUsesExternalImageUrls({ importMode: 'full_download', assetStatus: 'local' }), false);
  assert.equal(seriesUsesExternalImageUrls({ importMode: 'full_download', assetStatus: 'mixed' }), true);

  const html = renderAssetModeBadge({ importMode: 'full_download', assetStatus: 's3' });
  assert.match(html, /Cào từ gốc \+ tải ảnh/);
  assert.match(html, /Đã sync S3/);
});

test('sourceUrlForAdminSeries prefers direct source URL then source mappings', () => {
  assert.equal(sourceUrlForAdminSeries({ sourceUrl: 'https://source.test/direct' }), 'https://source.test/direct');
  assert.equal(sourceUrlForAdminSeries({
    sourceMappings: [
      { adapter: 'empty' },
      { adapter: 'truyenqq', sourceUrl: 'https://source.test/mapped' }
    ]
  }), 'https://source.test/mapped');
  assert.equal(sourceUrlForAdminSeries({}), '');
});
